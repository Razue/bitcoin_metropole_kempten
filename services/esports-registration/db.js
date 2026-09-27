const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TOURNAMENT = Object.freeze({
  id: '21-esports-fc-season-1',
  name: '21 eSports Pokal – EA SPORTS FC Season 1',
  organizer: 'Bitcoin Metropole Kempten',
  eventDate: '2026-10-18',
  startTime: '10:00',
  capacity: 32
});

const INITIAL_FIXED_PARTICIPANTS = Object.freeze([
  { nickname: 'BitFit', bracketPosition: 4 },
  { nickname: 'FireOverFiat', bracketPosition: 7 },
  { nickname: 'MischaTurm', bracketPosition: 25 }
]);

// A pending email registration is deliberately NOT a capacity reservation.
// Only confirmed participants count toward the 32-person limit.

const PENDING_CONFIRMATION_TTL_SECONDS = 30 * 60;

function timestamp() {
  return Math.floor(Date.now() / 1000);
}

function normalizeNickname(value) {
  if (typeof value !== 'string') throw new Error('invalid_nickname');
  const nickname = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (nickname.length < 1 || nickname.length > 32 || /[\u0000-\u001F\u007F]/.test(nickname)) {
    throw new Error('invalid_nickname');
  }
  return { nickname, nicknameKey: nickname.toLocaleLowerCase('de-DE') };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new Error('invalid_email');
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) throw new Error('invalid_email');
  return email;
}

function normalizePubkey(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('invalid_nostr_pubkey');
  }
  return value.toLowerCase();
}

function createDatabase(dbPath) {
  const directory = path.dirname(dbPath);
  fs.mkdirSync(directory, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  function withImmediateTransaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) { /* transaction is already closed */ }
      throw error;
    }
  }

  function migrate() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        organizer TEXT NOT NULL,
        event_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        capacity INTEGER NOT NULL CHECK (capacity = 32),
        registration_status TEXT NOT NULL DEFAULT 'open'
          CHECK (registration_status IN ('open', 'closed')),
        bracket_status TEXT NOT NULL DEFAULT 'draft'
          CHECK (bracket_status IN ('draft', 'locked', 'live', 'completed')),
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        registration_number INTEGER NOT NULL,
        nickname TEXT NOT NULL,
        nickname_key TEXT NOT NULL,
        contact_type TEXT NOT NULL CHECK (contact_type IN ('manual', 'email', 'nostr')),
        email TEXT,
        nostr_pubkey TEXT,
        bracket_position INTEGER CHECK (bracket_position BETWEEN 1 AND 32),
        is_fixed_bracket_position INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed_bracket_position IN (0, 1)),
        status TEXT NOT NULL CHECK (status IN ('pending_email', 'confirmed', 'no_show', 'disqualified', 'withdrawn')),
        source TEXT NOT NULL CHECK (source IN ('manual_seed', 'core_registration', 'admin', 'online_email', 'online_nostr')),
        group_code TEXT CHECK (group_code IN ('A', 'B', 'C')),
        checkin_time TEXT,
        estimated_match_time TEXT,
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER,
        CHECK (
          (contact_type = 'manual' AND email IS NULL AND nostr_pubkey IS NULL) OR
          (contact_type = 'email' AND email IS NOT NULL AND nostr_pubkey IS NULL) OR
          (contact_type = 'nostr' AND email IS NULL AND nostr_pubkey IS NOT NULL)
        ),
        UNIQUE (tournament_id, registration_number),
        UNIQUE (tournament_id, nickname_key)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS participants_unique_bracket_position
        ON participants(tournament_id, bracket_position)
        WHERE bracket_position IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS participants_unique_email
        ON participants(tournament_id, email)
        WHERE email IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS participants_unique_nostr_pubkey
        ON participants(tournament_id, nostr_pubkey)
        WHERE nostr_pubkey IS NOT NULL;

      CREATE INDEX IF NOT EXISTS participants_by_tournament_status
        ON participants(tournament_id, status);

      CREATE TABLE IF NOT EXISTS email_confirmations (
        participant_id TEXT PRIMARY KEY REFERENCES participants(id),
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
        used_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS email_confirmations_by_token_hash
        ON email_confirmations(token_hash);

      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, strftime('%s', 'now'));
    `);
  }

  function ensureTournament() {
    const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(TOURNAMENT.id);
    if (!existing) {
      db.prepare(`INSERT INTO tournaments
        (id, name, organizer, event_date, start_time, capacity, registration_status, bracket_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', 'draft', ?)`)
        .run(
          TOURNAMENT.id,
          TOURNAMENT.name,
          TOURNAMENT.organizer,
          TOURNAMENT.eventDate,
          TOURNAMENT.startTime,
          TOURNAMENT.capacity,
          timestamp()
        );
      return;
    }

    if (existing.capacity !== TOURNAMENT.capacity) {
      throw new Error('tournament_capacity_mismatch');
    }
  }

  function nextRegistrationNumber() {
    const row = db.prepare(`SELECT COALESCE(MAX(registration_number), 0) + 1 AS registration_number
      FROM participants WHERE tournament_id = ?`).get(TOURNAMENT.id);
    return row.registration_number;
  }

  function seedInitialParticipants() {
    return withImmediateTransaction(() => {
      ensureTournament();

      for (const initial of INITIAL_FIXED_PARTICIPANTS) {
        const nickname = normalizeNickname(initial.nickname);
        const atPosition = db.prepare(`SELECT nickname, nickname_key, bracket_position,
          is_fixed_bracket_position, status, source
          FROM participants WHERE tournament_id = ? AND bracket_position = ?`)
          .get(TOURNAMENT.id, initial.bracketPosition);

        if (atPosition) {
          if (
            atPosition.nickname_key !== nickname.nicknameKey ||
            atPosition.is_fixed_bracket_position !== 1 ||
            atPosition.status !== 'confirmed' ||
            atPosition.source !== 'manual_seed'
          ) {
            throw new Error(`initial_seed_conflict_position_${initial.bracketPosition}`);
          }
          continue;
        }

        const byNickname = db.prepare(`SELECT bracket_position FROM participants
          WHERE tournament_id = ? AND nickname_key = ?`)
          .get(TOURNAMENT.id, nickname.nicknameKey);
        if (byNickname) {
          throw new Error(`initial_seed_conflict_nickname_${nickname.nickname}`);
        }

        db.prepare(`INSERT INTO participants
          (id, tournament_id, registration_number, nickname, nickname_key, contact_type,
           email, nostr_pubkey, bracket_position, is_fixed_bracket_position,
           status, source, created_at, confirmed_at)
          VALUES (?, ?, ?, ?, ?, 'manual', NULL, NULL, ?, 1, 'confirmed', 'manual_seed', ?, ?)`)
          .run(
            crypto.randomUUID(),
            TOURNAMENT.id,
            nextRegistrationNumber(),
            nickname.nickname,
            nickname.nicknameKey,
            initial.bracketPosition,
            timestamp(),
            timestamp()
          );
      }
    });
  }

  function cleanupExpiredPendingRegistrations() {
    const expiredParticipants = db.prepare(`SELECT p.id FROM participants p
      JOIN email_confirmations c ON c.participant_id = p.id
      WHERE p.tournament_id = ?
        AND p.status = 'pending_email'
        AND c.used = 0
        AND c.expires_at < ?`).all(TOURNAMENT.id, timestamp());

    for (const participant of expiredParticipants) {
      db.prepare('DELETE FROM email_confirmations WHERE participant_id = ?').run(participant.id);
      db.prepare("DELETE FROM participants WHERE id = ? AND status = 'pending_email'").run(participant.id);
    }
    return expiredParticipants.length;
  }

  function countCapacityParticipants() {
    return countConfirmedParticipants();
  }

  function countConfirmedParticipants() {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM participants
      WHERE tournament_id = ? AND status = 'confirmed'`).get(TOURNAMENT.id);
    return row.count;
  }

  function registerConfirmedParticipant({ nickname, contactType = 'manual', email = null, nostrPubkey = null, source = 'core_registration' }) {
    return withImmediateTransaction(() => {
      const tournament = db.prepare('SELECT registration_status, capacity FROM tournaments WHERE id = ?')
        .get(TOURNAMENT.id);
      if (!tournament || tournament.registration_status !== 'open') {
        return { success: false, reason: 'registration_closed' };
      }

      if (countCapacityParticipants() >= tournament.capacity) {
        return { success: false, reason: 'capacity_reached' };
      }

      const normalizedNickname = normalizeNickname(nickname);
      let normalizedEmail = null;
      let normalizedPubkey = null;

      if (contactType === 'email') {
        normalizedEmail = normalizeEmail(email);
      } else if (contactType === 'nostr') {
        normalizedPubkey = normalizePubkey(nostrPubkey);
      } else if (contactType !== 'manual') {
        throw new Error('invalid_contact_type');
      }

      const registrationNumber = nextRegistrationNumber();
      const now = timestamp();
      db.prepare(`INSERT INTO participants
        (id, tournament_id, registration_number, nickname, nickname_key, contact_type,
         email, nostr_pubkey, bracket_position, is_fixed_bracket_position,
         status, source, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'confirmed', ?, ?, ?)`)
        .run(
          crypto.randomUUID(),
          TOURNAMENT.id,
          registrationNumber,
          normalizedNickname.nickname,
          normalizedNickname.nicknameKey,
          contactType,
          normalizedEmail,
          normalizedPubkey,
          source,
          now,
          now
        );

      return {
        success: true,
        participant: {
          nickname: normalizedNickname.nickname,
          registrationNumber,
          bracketPosition: null,
          status: 'confirmed'
        }
      };
    });
  }

  function startEmailRegistration({ nickname, email }) {
    const normalizedNickname = normalizeNickname(nickname);
    const normalizedEmail = normalizeEmail(email);

    return withImmediateTransaction(() => {
      cleanupExpiredPendingRegistrations();
      const tournament = db.prepare('SELECT registration_status FROM tournaments WHERE id = ?')
        .get(TOURNAMENT.id);
      if (!tournament || tournament.registration_status !== 'open') {
        return { success: false, reason: 'registration_closed' };
      }

      const now = timestamp();
      const expiresAt = now + PENDING_CONFIRMATION_TTL_SECONDS;
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const participantId = crypto.randomUUID();
      const registrationNumber = nextRegistrationNumber();

      db.prepare(`INSERT INTO participants
        (id, tournament_id, registration_number, nickname, nickname_key, contact_type,
         email, nostr_pubkey, bracket_position, is_fixed_bracket_position,
         status, source, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, 'email', ?, NULL, NULL, 0, 'pending_email', 'online_email', ?, NULL)`)
        .run(
          participantId,
          TOURNAMENT.id,
          registrationNumber,
          normalizedNickname.nickname,
          normalizedNickname.nicknameKey,
          normalizedEmail,
          now
        );

      db.prepare(`INSERT INTO email_confirmations
        (participant_id, token_hash, expires_at, used, used_at)
        VALUES (?, ?, ?, 0, NULL)`)
        .run(participantId, tokenHash, expiresAt);

      return {
        success: true,
        participantId,
        registrationNumber,
        nickname: normalizedNickname.nickname,
        email: normalizedEmail,
        confirmationToken: token,
        expiresAt
      };
    });
  }

  function confirmEmailRegistrationByToken(token) {
    if (typeof token !== 'string' || token.length === 0) {
      return { success: false, reason: 'invalid_token' };
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return withImmediateTransaction(() => {
      const confirmation = db.prepare(`SELECT participant_id, expires_at, used
        FROM email_confirmations
        WHERE token_hash = ?`).get(tokenHash);

      if (!confirmation) {
        return { success: false, reason: 'invalid_token' };
      }

      if (confirmation.used === 1) {
        return { success: false, reason: 'token_already_used' };
      }

      if (confirmation.expires_at < timestamp()) {
        db.prepare('DELETE FROM email_confirmations WHERE participant_id = ?').run(confirmation.participant_id);
        db.prepare("DELETE FROM participants WHERE id = ? AND status = 'pending_email'")
          .run(confirmation.participant_id);
        return { success: false, reason: 'token_expired' };
      }

      const tournament = db.prepare('SELECT capacity FROM tournaments WHERE id = ?').get(TOURNAMENT.id);
      if (!tournament || countCapacityParticipants() >= tournament.capacity) {
        // Keep the pending record and unused token intact: a later capacity change may permit retry.
        return { success: false, reason: 'capacity_reached' };
      }

      const updateParticipant = db.prepare(`UPDATE participants SET status = 'confirmed', confirmed_at = ?
        WHERE id = ? AND status = 'pending_email'`)
        .run(timestamp(), confirmation.participant_id);
      if (updateParticipant.changes !== 1) {
        return { success: false, reason: 'token_already_used' };
      }

      const updateToken = db.prepare(`UPDATE email_confirmations SET used = 1, used_at = ?
        WHERE participant_id = ? AND used = 0`)
        .run(timestamp(), confirmation.participant_id);
      if (updateToken.changes !== 1) {
        throw new Error('confirmation_token_state_inconsistent');
      }

      const participant = db.prepare(`SELECT nickname, registration_number, email
        FROM participants WHERE id = ?`).get(confirmation.participant_id);

      return {
        success: true,
        participant: {
          id: confirmation.participant_id,
          nickname: participant.nickname,
          registrationNumber: participant.registration_number,
          email: participant.email,
          status: 'confirmed',
          bracketPosition: null
        }
      };
    });
  }

  function getPublicTournament() {
    const tournament = db.prepare(`SELECT id, name, organizer, event_date, start_time, capacity,
      registration_status, bracket_status FROM tournaments WHERE id = ?`).get(TOURNAMENT.id);
    if (!tournament) throw new Error('tournament_missing');

    const participants = db.prepare(`SELECT nickname, registration_number, bracket_position, status
      FROM participants WHERE tournament_id = ? AND status = 'confirmed'
      ORDER BY registration_number ASC`).all(TOURNAMENT.id).map((participant) => ({
      nickname: participant.nickname,
      registrationNumber: participant.registration_number,
      bracketPosition: participant.bracket_position,
      status: participant.status
    }));

    const confirmedParticipantCount = countConfirmedParticipants();
    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        organizer: tournament.organizer,
        date: tournament.event_date,
        startTime: tournament.start_time,
        capacity: tournament.capacity,
        registrationStatus: tournament.registration_status,
        bracketStatus: tournament.bracket_status
      },
      confirmedParticipantCount,
      availableParticipantPlaces: tournament.capacity - confirmedParticipantCount,
      participants,
      fixedBracketPositions: participants
        .filter((participant) => participant.bracketPosition !== null)
        .map((participant) => ({
          nickname: participant.nickname,
          bracketPosition: participant.bracketPosition
        }))
    };
  }

  migrate();
  seedInitialParticipants();

  function _expireConfirmationForTest(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare(`UPDATE email_confirmations
      SET expires_at = ?
      WHERE token_hash = ?`)
      .run(timestamp() - 1, tokenHash);
  }

  function _allForTest() {
    return db.prepare(`SELECT id, tournament_id, registration_number, nickname,
      contact_type, email, nostr_pubkey, bracket_position, status, source, created_at
      FROM participants WHERE tournament_id = ?
      ORDER BY registration_number ASC`).all(TOURNAMENT.id);
  }

  function _getConfirmationForTest(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return db.prepare(`SELECT token_hash, expires_at, used, used_at FROM email_confirmations
      WHERE token_hash = ?`).get(tokenHash);
  }

  return {
    close: () => db.close(),
    getPublicTournament,
    registerConfirmedParticipant,
    seedInitialParticipants,
    startEmailRegistration,
    confirmEmailRegistrationByToken,
    _expireConfirmationForTest,
    _allForTest,
    _getConfirmationForTest
  };
}

module.exports = {
  INITIAL_FIXED_PARTICIPANTS,
  TOURNAMENT,
  PENDING_CONFIRMATION_TTL_SECONDS,
  createDatabase
};
