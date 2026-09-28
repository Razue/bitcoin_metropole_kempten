const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TOURNAMENT = Object.freeze({
  id: '21-esports-fc-season-1',
  name: '21 eSports Pokal – FC Season 1',
  organizer: 'Bitcoin Metropole Kempten',
  eventDate: '2026-10-18',
  startTime: '10:00',
  capacity: 32,
  gameId: 'fc',
  seasonLabel: 'FC Season 1',
  seasonNumber: 1
});

const INITIAL_FIXED_PARTICIPANTS = Object.freeze([
  { nickname: 'BitFit', bracketPosition: 4 },
  { nickname: 'FireOverFiat', bracketPosition: 7 },
  { nickname: 'MischaTurm', bracketPosition: 25 }
]);

// A pending email registration is deliberately NOT a capacity reservation.
// Only confirmed participants count toward the 32-person limit.
const PENDING_CONFIRMATION_TTL_SECONDS = 30 * 60;
const ELIGIBLE_MATCH_STATUS = 'confirmed';
const FINISHED_MATCH_STATES = new Set(['completed', 'bye', 'void']);

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

function normalizeId(value, errorName = 'invalid_id') {
  if (typeof value !== 'string' || value.length < 2 || value.length > 80 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(value)) {
    throw new Error(errorName);
  }
  return value.toLowerCase();
}

function secureShuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const replacement = crypto.randomInt(index + 1);
    [copy[index], copy[replacement]] = [copy[replacement], copy[index]];
  }
  return copy;
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

  function columns(tableName) {
    return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
  }

  function addColumnIfMissing(tableName, definition) {
    const columnName = definition.trim().split(/\s+/)[0];
    if (!columns(tableName).has(columnName)) db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }

  function migrate() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
        season_id TEXT,
        game_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL UNIQUE REFERENCES tournaments(id),
        game_id TEXT NOT NULL REFERENCES games(id),
        series_name TEXT NOT NULL,
        season_label TEXT NOT NULL,
        season_number INTEGER NOT NULL CHECK (season_number >= 1),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE (series_name, game_id, season_number)
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

      CREATE TABLE IF NOT EXISTS bracket_draws (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        status TEXT NOT NULL CHECK (status IN ('preview', 'locked', 'superseded')),
        assignments_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        locked_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS bracket_draws_by_tournament ON bracket_draws(tournament_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id),
        draw_id TEXT NOT NULL REFERENCES bracket_draws(id),
        stage TEXT NOT NULL CHECK (stage IN ('main', 'third_place')),
        round_number INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        participant_one_id TEXT REFERENCES participants(id),
        participant_two_id TEXT REFERENCES participants(id),
        left_source_match_id TEXT REFERENCES matches(id),
        right_source_match_id TEXT REFERENCES matches(id),
        next_match_id TEXT REFERENCES matches(id),
        next_match_slot INTEGER CHECK (next_match_slot IN (1, 2)),
        loser_next_match_id TEXT REFERENCES matches(id),
        loser_next_match_slot INTEGER CHECK (loser_next_match_slot IN (1, 2)),
        winner_id TEXT REFERENCES participants(id),
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed', 'bye', 'void')),
        result_type TEXT CHECK (result_type IN ('played', 'bye', 'forfeit', 'void')),
        completed_at INTEGER,
        UNIQUE (draw_id, stage, round_number, match_number)
      );
      CREATE INDEX IF NOT EXISTS matches_by_tournament ON matches(tournament_id, round_number, match_number);

      CREATE TABLE IF NOT EXISTS season_results (
        season_id TEXT NOT NULL REFERENCES seasons(id),
        rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 4),
        participant_id TEXT NOT NULL REFERENCES participants(id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (season_id, rank),
        UNIQUE (season_id, participant_id)
      );

      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, strftime('%s', 'now'));
    `);

    // Existing Phase 3A/3B databases have the original tournament schema. SQLite can only
    // add these nullable migration columns, which intentionally preserves all participants.
    addColumnIfMissing('tournaments', 'season_id TEXT');
    addColumnIfMissing('tournaments', 'game_id TEXT');
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, ?)').run(timestamp());
  }

  function ensureTournamentRecord(tournament) {
    const current = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournament.id);
    if (!current) {
      db.prepare(`INSERT INTO tournaments
        (id, name, organizer, event_date, start_time, capacity, registration_status, bracket_status, season_id, game_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', 'draft', ?, ?, ?)`)
        .run(tournament.id, tournament.name, tournament.organizer, tournament.eventDate, tournament.startTime,
          tournament.capacity, tournament.id, tournament.gameId, timestamp());
      return;
    }
    if (current.capacity !== tournament.capacity) throw new Error('tournament_capacity_mismatch');
    db.prepare('UPDATE tournaments SET name = ?, season_id = ?, game_id = ? WHERE id = ?')
      .run(tournament.name, tournament.id, tournament.gameId, tournament.id);
  }

  function ensureCurrentSeason() {
    db.prepare('INSERT OR IGNORE INTO games(id, name, created_at) VALUES (?, ?, ?)')
      .run(TOURNAMENT.gameId, 'EA SPORTS FC', timestamp());
    ensureTournamentRecord(TOURNAMENT);
    db.prepare(`INSERT OR IGNORE INTO seasons
      (id, tournament_id, game_id, series_name, season_label, season_number, status, created_at)
      VALUES (?, ?, ?, '21 eSports', ?, ?, 'active', ?)`)
      .run(TOURNAMENT.id, TOURNAMENT.id, TOURNAMENT.gameId, TOURNAMENT.seasonLabel, TOURNAMENT.seasonNumber, timestamp());
  }

  function nextRegistrationNumber(tournamentId = TOURNAMENT.id) {
    return db.prepare(`SELECT COALESCE(MAX(registration_number), 0) + 1 AS registration_number
      FROM participants WHERE tournament_id = ?`).get(tournamentId).registration_number;
  }

  function seedInitialParticipants() {
    return withImmediateTransaction(() => {
      ensureCurrentSeason();
      for (const initial of INITIAL_FIXED_PARTICIPANTS) {
        const nickname = normalizeNickname(initial.nickname);
        const atPosition = db.prepare(`SELECT nickname_key, is_fixed_bracket_position, status, source
          FROM participants WHERE tournament_id = ? AND bracket_position = ?`)
          .get(TOURNAMENT.id, initial.bracketPosition);
        if (atPosition) {
          if (atPosition.nickname_key !== nickname.nicknameKey || atPosition.is_fixed_bracket_position !== 1 ||
              atPosition.status !== 'confirmed' || atPosition.source !== 'manual_seed') {
            throw new Error(`initial_seed_conflict_position_${initial.bracketPosition}`);
          }
          continue;
        }
        if (db.prepare('SELECT id FROM participants WHERE tournament_id = ? AND nickname_key = ?')
          .get(TOURNAMENT.id, nickname.nicknameKey)) {
          throw new Error(`initial_seed_conflict_nickname_${nickname.nickname}`);
        }
        const now = timestamp();
        db.prepare(`INSERT INTO participants
          (id, tournament_id, registration_number, nickname, nickname_key, contact_type, email, nostr_pubkey,
           bracket_position, is_fixed_bracket_position, status, source, created_at, confirmed_at)
          VALUES (?, ?, ?, ?, ?, 'manual', NULL, NULL, ?, 1, 'confirmed', 'manual_seed', ?, ?)`)
          .run(crypto.randomUUID(), TOURNAMENT.id, nextRegistrationNumber(), nickname.nickname, nickname.nicknameKey,
            initial.bracketPosition, now, now);
      }
    });
  }

  function cleanupExpiredPendingRegistrations() {
    const expired = db.prepare(`SELECT p.id FROM participants p JOIN email_confirmations c ON c.participant_id = p.id
      WHERE p.tournament_id = ? AND p.status = 'pending_email' AND c.used = 0 AND c.expires_at < ?`)
      .all(TOURNAMENT.id, timestamp());
    for (const participant of expired) {
      db.prepare('DELETE FROM email_confirmations WHERE participant_id = ?').run(participant.id);
      db.prepare("DELETE FROM participants WHERE id = ? AND status = 'pending_email'").run(participant.id);
    }
    return expired.length;
  }

  function countConfirmedParticipants(tournamentId = TOURNAMENT.id) {
    return db.prepare("SELECT COUNT(*) AS count FROM participants WHERE tournament_id = ? AND status = 'confirmed'")
      .get(tournamentId).count;
  }

  function registerConfirmedParticipant({ nickname, contactType = 'manual', email = null, nostrPubkey = null, source = 'core_registration' }) {
    return withImmediateTransaction(() => {
      const tournament = db.prepare('SELECT registration_status, capacity FROM tournaments WHERE id = ?').get(TOURNAMENT.id);
      if (!tournament || tournament.registration_status !== 'open') return { success: false, reason: 'registration_closed' };
      if (countConfirmedParticipants() >= tournament.capacity) return { success: false, reason: 'capacity_reached' };
      const normalizedNickname = normalizeNickname(nickname);
      const normalizedEmail = contactType === 'email' ? normalizeEmail(email) : null;
      const normalizedPubkey = contactType === 'nostr' ? normalizePubkey(nostrPubkey) : null;
      if (!['manual', 'email', 'nostr'].includes(contactType)) throw new Error('invalid_contact_type');
      const now = timestamp();
      const registrationNumber = nextRegistrationNumber();
      db.prepare(`INSERT INTO participants
        (id, tournament_id, registration_number, nickname, nickname_key, contact_type, email, nostr_pubkey,
         bracket_position, is_fixed_bracket_position, status, source, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'confirmed', ?, ?, ?)`)
        .run(crypto.randomUUID(), TOURNAMENT.id, registrationNumber, normalizedNickname.nickname,
          normalizedNickname.nicknameKey, contactType, normalizedEmail, normalizedPubkey, source, now, now);
      return { success: true, participant: { nickname: normalizedNickname.nickname, registrationNumber, bracketPosition: null, status: 'confirmed' } };
    });
  }

  function startEmailRegistration({ nickname, email }) {
    const normalizedNickname = normalizeNickname(nickname);
    const normalizedEmail = normalizeEmail(email);
    return withImmediateTransaction(() => {
      cleanupExpiredPendingRegistrations();
      const tournament = db.prepare('SELECT registration_status FROM tournaments WHERE id = ?').get(TOURNAMENT.id);
      if (!tournament || tournament.registration_status !== 'open') return { success: false, reason: 'registration_closed' };
      const now = timestamp();
      const token = crypto.randomBytes(32).toString('hex');
      const participantId = crypto.randomUUID();
      const registrationNumber = nextRegistrationNumber();
      db.prepare(`INSERT INTO participants
        (id, tournament_id, registration_number, nickname, nickname_key, contact_type, email, nostr_pubkey,
         bracket_position, is_fixed_bracket_position, status, source, created_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, 'email', ?, NULL, NULL, 0, 'pending_email', 'online_email', ?, NULL)`)
        .run(participantId, TOURNAMENT.id, registrationNumber, normalizedNickname.nickname, normalizedNickname.nicknameKey, normalizedEmail, now);
      db.prepare('INSERT INTO email_confirmations(participant_id, token_hash, expires_at, used, used_at) VALUES (?, ?, ?, 0, NULL)')
        .run(participantId, crypto.createHash('sha256').update(token).digest('hex'), now + PENDING_CONFIRMATION_TTL_SECONDS);
      return { success: true, participantId, registrationNumber, nickname: normalizedNickname.nickname, email: normalizedEmail,
        confirmationToken: token, expiresAt: now + PENDING_CONFIRMATION_TTL_SECONDS };
    });
  }

  function confirmEmailRegistrationByToken(token) {
    if (typeof token !== 'string' || token.length === 0) return { success: false, reason: 'invalid_token' };
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return withImmediateTransaction(() => {
      const confirmation = db.prepare('SELECT participant_id, expires_at, used FROM email_confirmations WHERE token_hash = ?').get(tokenHash);
      if (!confirmation) return { success: false, reason: 'invalid_token' };
      if (confirmation.used === 1) return { success: false, reason: 'token_already_used' };
      if (confirmation.expires_at < timestamp()) {
        db.prepare('DELETE FROM email_confirmations WHERE participant_id = ?').run(confirmation.participant_id);
        db.prepare("DELETE FROM participants WHERE id = ? AND status = 'pending_email'").run(confirmation.participant_id);
        return { success: false, reason: 'token_expired' };
      }
      const tournament = db.prepare('SELECT capacity FROM tournaments WHERE id = ?').get(TOURNAMENT.id);
      if (!tournament || countConfirmedParticipants() >= tournament.capacity) return { success: false, reason: 'capacity_reached' };
      if (db.prepare("UPDATE participants SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'pending_email'")
        .run(timestamp(), confirmation.participant_id).changes !== 1) return { success: false, reason: 'token_already_used' };
      if (db.prepare('UPDATE email_confirmations SET used = 1, used_at = ? WHERE participant_id = ? AND used = 0')
        .run(timestamp(), confirmation.participant_id).changes !== 1) throw new Error('confirmation_token_state_inconsistent');
      const participant = db.prepare('SELECT nickname, registration_number, email FROM participants WHERE id = ?').get(confirmation.participant_id);
      return { success: true, participant: { id: confirmation.participant_id, nickname: participant.nickname,
        registrationNumber: participant.registration_number, email: participant.email, status: 'confirmed', bracketPosition: null } };
    });
  }

  function requireTournament(tournamentId) {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) throw new Error('tournament_missing');
    return tournament;
  }

  function getPublicTournament(tournamentId = TOURNAMENT.id) {
    const tournament = requireTournament(tournamentId);
    const season = db.prepare(`SELECT s.id, s.series_name, s.season_label, s.season_number, s.status, g.id AS game_id, g.name AS game_name
      FROM seasons s JOIN games g ON g.id = s.game_id WHERE s.tournament_id = ?`).get(tournamentId);
    const participants = db.prepare(`SELECT nickname, registration_number, bracket_position, status FROM participants
      WHERE tournament_id = ? AND status = 'confirmed' ORDER BY registration_number ASC`).all(tournamentId)
      .map((participant) => ({ nickname: participant.nickname, registrationNumber: participant.registration_number,
        bracketPosition: participant.bracket_position, status: participant.status }));
    const confirmedParticipantCount = countConfirmedParticipants(tournamentId);
    return {
      tournament: { id: tournament.id, name: tournament.name, organizer: tournament.organizer, date: tournament.event_date,
        startTime: tournament.start_time, capacity: tournament.capacity, registrationStatus: tournament.registration_status,
        bracketStatus: tournament.bracket_status },
      season: season && { id: season.id, seriesName: season.series_name, label: season.season_label,
        number: season.season_number, status: season.status, game: { id: season.game_id, name: season.game_name } },
      confirmedParticipantCount,
      availableParticipantPlaces: tournament.capacity - confirmedParticipantCount,
      participants,
      fixedBracketPositions: participants.filter((participant) => participant.bracketPosition !== null)
        .map((participant) => ({ nickname: participant.nickname, bracketPosition: participant.bracketPosition }))
    };
  }

  function createSeason({ id, gameId, gameName, seasonLabel, seasonNumber, eventDate, startTime, name }) {
    const seasonId = normalizeId(id, 'invalid_season_id');
    const normalizedGameId = normalizeId(gameId, 'invalid_game_id');
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) throw new Error('invalid_season_number');
    if (typeof gameName !== 'string' || !gameName.trim() || typeof seasonLabel !== 'string' || !seasonLabel.trim() ||
        typeof eventDate !== 'string' || typeof startTime !== 'string') throw new Error('invalid_season');
    return withImmediateTransaction(() => {
      db.prepare('INSERT OR IGNORE INTO games(id, name, created_at) VALUES (?, ?, ?)').run(normalizedGameId, gameName.trim(), timestamp());
      const tournament = { id: seasonId, name: name || `21 eSports Pokal – ${seasonLabel.trim()}`,
        organizer: TOURNAMENT.organizer, eventDate, startTime, capacity: 32, gameId: normalizedGameId };
      ensureTournamentRecord(tournament);
      db.prepare(`INSERT INTO seasons(id, tournament_id, game_id, series_name, season_label, season_number, status, created_at)
        VALUES (?, ?, ?, '21 eSports', ?, ?, 'active', ?)`)
        .run(seasonId, seasonId, normalizedGameId, seasonLabel.trim(), seasonNumber, timestamp());
      return getPublicTournament(seasonId);
    });
  }

  function createDrawPreview(tournamentId = TOURNAMENT.id) {
    return withImmediateTransaction(() => {
      const tournament = requireTournament(tournamentId);
      if (tournament.bracket_status !== 'draft') throw new Error('draw_already_locked');
      const fixed = db.prepare(`SELECT id, nickname, bracket_position FROM participants
        WHERE tournament_id = ? AND status = 'confirmed' AND is_fixed_bracket_position = 1`).all(tournamentId);
      const fixedPositions = new Set(fixed.map((participant) => participant.bracket_position));
      if (fixed.length !== fixedPositions.size || fixed.some((participant) => !participant.bracket_position)) throw new Error('fixed_position_invalid');
      const rest = db.prepare(`SELECT id, nickname FROM participants
        WHERE tournament_id = ? AND status = 'confirmed' AND is_fixed_bracket_position = 0 ORDER BY registration_number ASC`).all(tournamentId);
      const freePositions = Array.from({ length: 32 }, (_, index) => index + 1).filter((position) => !fixedPositions.has(position));
      const assignments = {};
      for (const participant of fixed) assignments[participant.bracket_position] = participant.id;
      for (const [index, participant] of secureShuffle(rest).entries()) assignments[freePositions[index]] = participant.id;
      db.prepare("UPDATE bracket_draws SET status = 'superseded' WHERE tournament_id = ? AND status = 'preview'").run(tournamentId);
      const drawId = crypto.randomUUID();
      db.prepare(`INSERT INTO bracket_draws(id, tournament_id, status, assignments_json, created_at, locked_at)
        VALUES (?, ?, 'preview', ?, ?, NULL)`).run(drawId, tournamentId, JSON.stringify(assignments), timestamp());
      return presentDraw(drawId, assignments);
    });
  }

  function presentDraw(drawId, assignments) {
    const participantIds = Object.values(assignments);
    const participants = participantIds.length ? db.prepare(`SELECT id, nickname FROM participants WHERE id IN (${participantIds.map(() => '?').join(',')})`).all(...participantIds) : [];
    const names = new Map(participants.map((participant) => [participant.id, participant.nickname]));
    return { id: drawId, status: 'preview', positions: Array.from({ length: 32 }, (_, index) => ({
      position: index + 1, participantId: assignments[index + 1] || null, nickname: assignments[index + 1] ? names.get(assignments[index + 1]) : null,
      bye: !assignments[index + 1]
    })) };
  }

  function materializeMatches(tournamentId, drawId, assignments) {
    const allRounds = {};
    const insert = db.prepare(`INSERT INTO matches
      (id, tournament_id, draw_id, stage, round_number, match_number, participant_one_id, participant_two_id,
       left_source_match_id, right_source_match_id, next_match_id, next_match_slot, loser_next_match_id, loser_next_match_slot,
       winner_id, state, result_type, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL)`);
    for (let round = 1; round <= 5; round += 1) {
      const count = 32 / (2 ** round);
      allRounds[round] = [];
      for (let matchNumber = 1; matchNumber <= count; matchNumber += 1) {
        const id = crypto.randomUUID();
        const one = round === 1 ? assignments[(matchNumber * 2) - 1] || null : null;
        const two = round === 1 ? assignments[matchNumber * 2] || null : null;
        const left = round === 1 ? null : allRounds[round - 1][(matchNumber - 1) * 2].id;
        const right = round === 1 ? null : allRounds[round - 1][((matchNumber - 1) * 2) + 1].id;
        insert.run(id, tournamentId, drawId, 'main', round, matchNumber, one, two, left, right);
        allRounds[round].push({ id });
      }
    }
    const thirdPlaceId = crypto.randomUUID();
    insert.run(thirdPlaceId, tournamentId, drawId, 'third_place', 6, 1, null, null, allRounds[4][0].id, allRounds[4][1].id);
    const setRouting = db.prepare(`UPDATE matches SET next_match_id = ?, next_match_slot = ?, loser_next_match_id = ?, loser_next_match_slot = ? WHERE id = ?`);
    for (let round = 1; round < 5; round += 1) {
      allRounds[round].forEach((match, index) => {
        const next = allRounds[round + 1][Math.floor(index / 2)].id;
        const loserTarget = round === 4 ? thirdPlaceId : null;
        setRouting.run(next, (index % 2) + 1, loserTarget, round === 4 ? (index % 2) + 1 : null, match.id);
      });
    }
    resolveAutomaticMatches(tournamentId);
  }

  function lockDraw(tournamentId = TOURNAMENT.id) {
    return withImmediateTransaction(() => {
      const tournament = requireTournament(tournamentId);
      if (tournament.bracket_status !== 'draft') throw new Error('draw_already_locked');
      const draw = db.prepare(`SELECT id, assignments_json FROM bracket_draws WHERE tournament_id = ? AND status = 'preview'
        ORDER BY created_at DESC LIMIT 1`).get(tournamentId);
      if (!draw) throw new Error('draw_preview_missing');
      const assignments = JSON.parse(draw.assignments_json);
      const fixed = db.prepare('SELECT id, bracket_position FROM participants WHERE tournament_id = ? AND is_fixed_bracket_position = 1').all(tournamentId);
      for (const participant of fixed) if (String(assignments[participant.bracket_position]) !== participant.id) throw new Error('fixed_position_changed');
      db.prepare('UPDATE participants SET bracket_position = NULL WHERE tournament_id = ? AND is_fixed_bracket_position = 0').run(tournamentId);
      const setPosition = db.prepare('UPDATE participants SET bracket_position = ? WHERE id = ? AND tournament_id = ?');
      for (const [position, participantId] of Object.entries(assignments)) setPosition.run(Number(position), participantId, tournamentId);
      db.prepare("UPDATE bracket_draws SET status = 'locked', locked_at = ? WHERE id = ?").run(timestamp(), draw.id);
      db.prepare("UPDATE tournaments SET bracket_status = 'locked', registration_status = 'closed' WHERE id = ?").run(tournamentId);
      materializeMatches(tournamentId, draw.id, assignments);
      return getAdminSeason(tournamentId);
    });
  }

  function sourcesResolved(match) {
    for (const sourceId of [match.left_source_match_id, match.right_source_match_id]) {
      if (!sourceId) continue;
      const source = db.prepare('SELECT state FROM matches WHERE id = ?').get(sourceId);
      if (!source || !FINISHED_MATCH_STATES.has(source.state)) return false;
    }
    return true;
  }

  function participantIsEligible(participantId) {
    if (!participantId) return false;
    return db.prepare('SELECT status FROM participants WHERE id = ?').get(participantId)?.status === ELIGIBLE_MATCH_STATUS;
  }

  function setFeed(matchId, slot, participantId) {
    if (!matchId || !participantId) return;
    const field = slot === 1 ? 'participant_one_id' : 'participant_two_id';
    const existing = db.prepare(`SELECT ${field} AS participant_id FROM matches WHERE id = ?`).get(matchId);
    if (!existing) throw new Error('next_match_missing');
    if (existing.participant_id && existing.participant_id !== participantId) throw new Error('match_feed_conflict');
    db.prepare(`UPDATE matches SET ${field} = ? WHERE id = ?`).run(participantId, matchId);
  }

  function completeMatch(match, { winnerId = null, state, resultType }) {
    db.prepare(`UPDATE matches SET winner_id = ?, state = ?, result_type = ?, completed_at = ? WHERE id = ? AND state = 'pending'`)
      .run(winnerId, state, resultType, timestamp(), match.id);
    if (winnerId) setFeed(match.next_match_id, match.next_match_slot, winnerId);
    const loserId = winnerId === match.participant_one_id ? match.participant_two_id
      : winnerId === match.participant_two_id ? match.participant_one_id : null;
    if (loserId) setFeed(match.loser_next_match_id, match.loser_next_match_slot, loserId);
  }

  function resolveAutomaticMatches(tournamentId) {
    let changed = true;
    while (changed) {
      changed = false;
      const matches = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? AND state = 'pending'
        ORDER BY round_number ASC, match_number ASC`).all(tournamentId);
      for (const match of matches) {
        if (!sourcesResolved(match)) continue;
        const one = participantIsEligible(match.participant_one_id);
        const two = participantIsEligible(match.participant_two_id);
        if (one && two) continue;
        if (one || two) {
          completeMatch(match, { winnerId: one ? match.participant_one_id : match.participant_two_id,
            state: 'bye', resultType: (match.participant_one_id || match.participant_two_id) ? 'bye' : 'void' });
        } else {
          completeMatch(match, { winnerId: null, state: 'void', resultType: 'void' });
        }
        changed = true;
      }
    }
  }

  function recordMatchResult({ tournamentId = TOURNAMENT.id, matchId, winnerId }) {
    return withImmediateTransaction(() => {
      const match = db.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').get(matchId, tournamentId);
      if (!match) throw new Error('match_missing');
      if (match.state !== 'pending') throw new Error('match_already_resolved');
      if (!sourcesResolved(match)) throw new Error('match_not_ready');
      if (!winnerId || ![match.participant_one_id, match.participant_two_id].includes(winnerId)) throw new Error('invalid_match_winner');
      if (!participantIsEligible(match.participant_one_id) || !participantIsEligible(match.participant_two_id)) throw new Error('participant_not_eligible');
      completeMatch(match, { winnerId, state: 'completed', resultType: 'played' });
      db.prepare("UPDATE tournaments SET bracket_status = CASE WHEN bracket_status = 'locked' THEN 'live' ELSE bracket_status END WHERE id = ?").run(tournamentId);
      resolveAutomaticMatches(tournamentId);
      return getMatch(matchId, false);
    });
  }

  function setParticipantStatus({ tournamentId = TOURNAMENT.id, participantId, status }) {
    if (!['confirmed', 'no_show', 'disqualified', 'withdrawn'].includes(status)) throw new Error('invalid_participant_status');
    return withImmediateTransaction(() => {
      const participant = db.prepare('SELECT id, is_fixed_bracket_position FROM participants WHERE id = ? AND tournament_id = ?')
        .get(participantId, tournamentId);
      if (!participant) throw new Error('participant_missing');
      db.prepare('UPDATE participants SET status = ? WHERE id = ?').run(status, participantId);
      resolveAutomaticMatches(tournamentId);
      return getAdminSeason(tournamentId);
    });
  }

  function getMatch(matchId, includePii) {
    const match = db.prepare(`SELECT m.*, p1.nickname AS participant_one_nickname, p2.nickname AS participant_two_nickname,
      w.nickname AS winner_nickname FROM matches m
      LEFT JOIN participants p1 ON p1.id = m.participant_one_id
      LEFT JOIN participants p2 ON p2.id = m.participant_two_id
      LEFT JOIN participants w ON w.id = m.winner_id WHERE m.id = ?`).get(matchId);
    if (!match) return null;
    return {
      id: match.id, stage: match.stage, round: match.round_number, number: match.match_number,
      participantOne: match.participant_one_id && { id: match.participant_one_id, nickname: match.participant_one_nickname },
      participantTwo: match.participant_two_id && { id: match.participant_two_id, nickname: match.participant_two_nickname },
      winner: match.winner_id && { id: match.winner_id, nickname: match.winner_nickname }, state: match.state, resultType: match.result_type
    };
  }

  function completeSeason(tournamentId = TOURNAMENT.id) {
    return withImmediateTransaction(() => {
      const season = db.prepare('SELECT * FROM seasons WHERE tournament_id = ?').get(tournamentId);
      if (!season) throw new Error('season_missing');
      const final = db.prepare("SELECT * FROM matches WHERE tournament_id = ? AND stage = 'main' AND round_number = 5").get(tournamentId);
      const third = db.prepare("SELECT * FROM matches WHERE tournament_id = ? AND stage = 'third_place'").get(tournamentId);
      if (!final || !FINISHED_MATCH_STATES.has(final.state) || !final.winner_id || !third || !FINISHED_MATCH_STATES.has(third.state)) {
        throw new Error('season_not_ready');
      }
      const finalLoser = final.winner_id === final.participant_one_id ? final.participant_two_id : final.participant_one_id;
      const thirdLoser = third.winner_id === third.participant_one_id ? third.participant_two_id : third.participant_one_id;
      const standings = [[1, final.winner_id], [2, finalLoser], [3, third.winner_id], [4, thirdLoser]]
        .filter(([, participantId]) => participantId);
      db.prepare('DELETE FROM season_results WHERE season_id = ?').run(season.id);
      const insert = db.prepare('INSERT INTO season_results(season_id, rank, participant_id, created_at) VALUES (?, ?, ?, ?)');
      for (const [rank, participantId] of standings) insert.run(season.id, rank, participantId, timestamp());
      db.prepare("UPDATE seasons SET status = 'completed', completed_at = ? WHERE id = ?").run(timestamp(), season.id);
      db.prepare("UPDATE tournaments SET bracket_status = 'completed', registration_status = 'closed' WHERE id = ?").run(tournamentId);
      return getHallOfFame();
    });
  }

  function getHallOfFame() {
    const seasons = db.prepare(`SELECT s.id, s.series_name, s.season_label, s.season_number, s.completed_at, g.id AS game_id, g.name AS game_name
      FROM seasons s JOIN games g ON g.id = s.game_id WHERE s.status = 'completed' ORDER BY s.completed_at DESC, s.season_number DESC`).all();
    return { seasons: seasons.map((season) => ({ id: season.id, seriesName: season.series_name, label: season.season_label,
      number: season.season_number, game: { id: season.game_id, name: season.game_name }, completedAt: season.completed_at,
      top4: db.prepare(`SELECT r.rank, p.nickname FROM season_results r JOIN participants p ON p.id = r.participant_id
        WHERE r.season_id = ? ORDER BY r.rank`).all(season.id).map((result) => ({ rank: result.rank, nickname: result.nickname }))
    })) };
  }

  function getAdminSeason(tournamentId = TOURNAMENT.id) {
    const publicState = getPublicTournament(tournamentId);
    const participants = db.prepare(`SELECT id, registration_number, nickname, contact_type, email, nostr_pubkey, bracket_position,
      is_fixed_bracket_position, status, source FROM participants WHERE tournament_id = ? ORDER BY registration_number`).all(tournamentId)
      .map((participant) => ({ id: participant.id, registrationNumber: participant.registration_number, nickname: participant.nickname,
        contactType: participant.contact_type, email: participant.email, nostrPubkey: participant.nostr_pubkey,
        bracketPosition: participant.bracket_position, fixedBracketPosition: participant.is_fixed_bracket_position === 1,
        status: participant.status, source: participant.source }));
    const matches = db.prepare('SELECT id FROM matches WHERE tournament_id = ? ORDER BY stage, round_number, match_number').all(tournamentId)
      .map((match) => getMatch(match.id, true));
    const draw = db.prepare(`SELECT id, status, created_at, locked_at FROM bracket_draws WHERE tournament_id = ? ORDER BY created_at DESC LIMIT 1`).get(tournamentId);
    return { ...publicState, participants, matches, draw: draw && { id: draw.id, status: draw.status, createdAt: draw.created_at, lockedAt: draw.locked_at } };
  }

  function _expireConfirmationForTest(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('UPDATE email_confirmations SET expires_at = ? WHERE token_hash = ?').run(timestamp() - 1, tokenHash);
  }
  function _allForTest() {
    return db.prepare(`SELECT id, tournament_id, registration_number, nickname, contact_type, email, nostr_pubkey,
      bracket_position, is_fixed_bracket_position, status, source, created_at FROM participants WHERE tournament_id = ? ORDER BY registration_number`).all(TOURNAMENT.id);
  }
  function _getConfirmationForTest(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return db.prepare('SELECT token_hash, expires_at, used, used_at FROM email_confirmations WHERE token_hash = ?').get(tokenHash);
  }

  migrate();
  ensureCurrentSeason();
  seedInitialParticipants();

  return {
    close: () => db.close(), getPublicTournament, getHallOfFame, getAdminSeason, createSeason,
    registerConfirmedParticipant, seedInitialParticipants, startEmailRegistration, confirmEmailRegistrationByToken,
    createDrawPreview, lockDraw, recordMatchResult, setParticipantStatus, completeSeason,
    _expireConfirmationForTest, _allForTest, _getConfirmationForTest
  };
}

module.exports = { INITIAL_FIXED_PARTICIPANTS, TOURNAMENT, PENDING_CONFIRMATION_TTL_SECONDS, createDatabase };
