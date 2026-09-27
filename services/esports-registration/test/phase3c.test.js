const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../app');
const { createDatabase, TOURNAMENT } = require('../db');

const temporaryRoot = path.join(__dirname, '.tmp-phase3c');
fs.rmSync(temporaryRoot, { recursive: true, force: true });
fs.mkdirSync(temporaryRoot, { recursive: true });

function dbFor(name) {
  return createDatabase(path.join(temporaryRoot, name, 'esports.db'));
}

async function startServer(database) {
  const app = createApp({ database, registrationEnabled: false, allowedOrigin: 'https://razue.github.io', adminSecret: 'local-3c-admin-secret' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      database.close();
    }
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, text };
}

function createLegacyDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE tournaments (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, organizer TEXT NOT NULL, event_date TEXT NOT NULL, start_time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity = 32), registration_status TEXT NOT NULL DEFAULT 'open',
      bracket_status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL
    );
    CREATE TABLE participants (
      id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, registration_number INTEGER NOT NULL, nickname TEXT NOT NULL,
      nickname_key TEXT NOT NULL, contact_type TEXT NOT NULL, email TEXT, nostr_pubkey TEXT, bracket_position INTEGER,
      is_fixed_bracket_position INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, source TEXT NOT NULL,
      group_code TEXT, checkin_time TEXT, estimated_match_time TEXT, created_at INTEGER NOT NULL, confirmed_at INTEGER,
      UNIQUE (tournament_id, registration_number), UNIQUE (tournament_id, nickname_key)
    );
    CREATE UNIQUE INDEX participants_unique_bracket_position ON participants(tournament_id, bracket_position) WHERE bracket_position IS NOT NULL;
    CREATE UNIQUE INDEX participants_unique_email ON participants(tournament_id, email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX participants_unique_nostr_pubkey ON participants(tournament_id, nostr_pubkey) WHERE nostr_pubkey IS NOT NULL;
    CREATE INDEX participants_by_tournament_status ON participants(tournament_id, status);
    CREATE TABLE email_confirmations (participant_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, used_at INTEGER);
    CREATE INDEX email_confirmations_by_token_hash ON email_confirmations(token_hash);
  `);
  db.prepare(`INSERT INTO tournaments(id, name, organizer, event_date, start_time, capacity, registration_status, bracket_status, created_at)
    VALUES (?, ?, ?, ?, ?, 32, 'open', 'draft', 1)`)
    .run(TOURNAMENT.id, '21 eSports Pokal – EA SPORTS FC Season 1', TOURNAMENT.organizer, TOURNAMENT.eventDate, TOURNAMENT.startTime);
  const seeded = [
    ['legacy-bitfit', 1, 'BitFit', 'bitfit', 4],
    ['legacy-fire', 2, 'FireOverFiat', 'fireoverfiat', 7],
    ['legacy-mischa', 3, 'MischaTurm', 'mischaturm', 25]
  ];
  const insert = db.prepare(`INSERT INTO participants(id, tournament_id, registration_number, nickname, nickname_key, contact_type,
    email, nostr_pubkey, bracket_position, is_fixed_bracket_position, status, source, created_at, confirmed_at)
    VALUES (?, ?, ?, ?, ?, 'manual', NULL, NULL, ?, 1, 'confirmed', 'manual_seed', 1, 1)`);
  seeded.forEach((participant) => insert.run(participant[0], TOURNAMENT.id, participant[1], participant[2], participant[3], participant[4]));
  db.close();
}

function testMigrationAndMultiSeason() {
  const legacyPath = path.join(temporaryRoot, 'legacy-migration', 'esports.db');
  createLegacyDatabase(legacyPath);
  const database = createDatabase(legacyPath);
  try {
    const current = database.getPublicTournament();
    assert.equal(current.tournament.name, '21 eSports Pokal – FC Season 1');
    assert.equal(current.season.seriesName, '21 eSports');
    assert.equal(current.season.label, 'FC Season 1');
    assert.equal(current.season.game.name, 'EA SPORTS FC');
    assert.equal(current.confirmedParticipantCount, 3, 'legacy participants must survive migration');
    assert.deepEqual(current.fixedBracketPositions, [
      { nickname: 'BitFit', bracketPosition: 4 }, { nickname: 'FireOverFiat', bracketPosition: 7 }, { nickname: 'MischaTurm', bracketPosition: 25 }
    ]);
    const future = database.createSeason({ id: '21-esports-fc-season-2', gameId: 'fc', gameName: 'EA SPORTS FC',
      seasonLabel: 'FC Season 2', seasonNumber: 2, eventDate: '2027-10-17', startTime: '10:00' });
    assert.equal(future.season.label, 'FC Season 2');
    assert.equal(future.confirmedParticipantCount, 0);
    assert.equal(database.getPublicTournament().confirmedParticipantCount, 3, 'Season 1 data must remain isolated');
  } finally { database.close(); }
}

function addConfirmed(database, count, prefix = 'Player') {
  for (let index = 1; index <= count; index += 1) {
    const result = database.registerConfirmedParticipant({ nickname: `${prefix}-${String(index).padStart(2, '0')}`, source: 'admin' });
    assert.equal(result.success, true);
  }
}

function testPreviewLockAndByes() {
  const database = dbFor('preview-byes');
  try {
    const original = database._allForTest();
    const preview = database.createDrawPreview();
    assert.equal(preview.status, 'preview');
    assert.equal(preview.positions.length, 32);
    assert.equal(preview.positions.find((position) => position.position === 4).nickname, 'BitFit');
    assert.equal(preview.positions.find((position) => position.position === 7).nickname, 'FireOverFiat');
    assert.equal(preview.positions.find((position) => position.position === 25).nickname, 'MischaTurm');
    assert.deepEqual(database._allForTest().map((participant) => participant.bracket_position), original.map((participant) => participant.bracket_position),
      'preview must never persist random positions');
    const locked = database.lockDraw();
    assert.equal(locked.tournament.bracketStatus, 'locked');
    assert.equal(locked.tournament.registrationStatus, 'closed');
    const afterLock = database._allForTest();
    assert.equal(afterLock.find((participant) => participant.nickname === 'BitFit').bracket_position, 4);
    assert.equal(afterLock.find((participant) => participant.nickname === 'FireOverFiat').bracket_position, 7);
    assert.equal(afterLock.find((participant) => participant.nickname === 'MischaTurm').bracket_position, 25);
    assert.equal(locked.matches.length, 32, '31 main matches plus one third-place match are persisted');
    assert.ok(locked.matches.some((match) => match.state === 'bye'), 'empty opposing slots must create BYEs');
    assert.throws(() => database.createDrawPreview(), /draw_already_locked/);
    const bitFit = afterLock.find((participant) => participant.nickname === 'BitFit');
    assert.equal(bitFit.bracket_position, 4);
    database.setParticipantStatus({ participantId: bitFit.id, status: 'no_show' });
    assert.equal(database._allForTest().find((participant) => participant.id === bitFit.id).bracket_position, 4,
      'a no-show may change availability but never the immutable fixed position');
  } finally { database.close(); }
}

function testNoShowProgressionTopFourAndHallOfFame() {
  const persistencePath = path.join(temporaryRoot, 'progression', 'esports.db');
  let database = createDatabase(persistencePath);
  try {
    addConfirmed(database, 29, 'Competitive');
    const fixed = database._allForTest().filter((participant) => participant.is_fixed_bracket_position === 1);
    const preview = database.createDrawPreview();
    assert.equal(preview.positions.filter((position) => !position.bye).length, 32);
    database.lockDraw();
    let admin = database.getAdminSeason();
    const firstMatch = admin.matches.find((match) => match.stage === 'main' && match.round === 1 && match.participantOne && match.participantTwo);
    assert.ok(firstMatch);
    const noShowId = firstMatch.participantOne.id;
    database.setParticipantStatus({ participantId: noShowId, status: 'no_show' });
    admin = database.getAdminSeason();
    const forfeited = admin.matches.find((match) => match.id === firstMatch.id);
    assert.equal(forfeited.state, 'bye');
    assert.equal(forfeited.winner.id, firstMatch.participantTwo.id, 'opponent must advance on no-show');
    assert.equal(database.getPublicTournament().participants.some((participant) => participant.nickname === firstMatch.participantOne.nickname), false, 'no-show must not appear in public confirmed list');
    const disqualificationMatch = admin.matches.find((match) => match.stage === 'main' && match.round === 1 && match.id !== firstMatch.id && match.state === 'pending' && match.participantOne && match.participantTwo);
    assert.ok(disqualificationMatch);
    database.setParticipantStatus({ participantId: disqualificationMatch.participantOne.id, status: 'disqualified' });
    admin = database.getAdminSeason();
    const disqualified = admin.matches.find((match) => match.id === disqualificationMatch.id);
    assert.equal(disqualified.state, 'bye');
    assert.equal(disqualified.winner.id, disqualificationMatch.participantTwo.id, 'opponent must advance on disqualification');

    // Resolve every remaining playable match with the first participant. Feed-forward must make each later round playable.
    let guard = 100;
    while (guard > 0) {
      guard -= 1;
      admin = database.getAdminSeason();
      const playable = admin.matches.find((match) => match.state === 'pending' && match.participantOne && match.participantTwo);
      if (!playable) break;
      database.recordMatchResult({ matchId: playable.id, winnerId: playable.participantOne.id });
    }
    assert.ok(guard > 0, 'match progression must converge');
    admin = database.getAdminSeason();
    assert.equal(admin.matches.filter((match) => match.state === 'pending').length, 0, 'all matches must resolve after recorded results');
    const hall = database.completeSeason();
    assert.equal(hall.seasons.length, 1);
    assert.equal(hall.seasons[0].label, 'FC Season 1');
    assert.equal(hall.seasons[0].top4.length, 4);
    assert.deepEqual(hall.seasons[0].top4.map((result) => result.rank), [1, 2, 3, 4]);
    assert.equal(database.getPublicTournament().tournament.bracketStatus, 'completed');
    database.close();
    database = createDatabase(persistencePath);
    const reloadedHall = database.getHallOfFame();
    assert.deepEqual(reloadedHall.seasons[0].top4.map((result) => result.rank), [1, 2, 3, 4], 'Top 4 must persist after reopening SQLite');
    assert.equal(database.getPublicTournament().tournament.bracketStatus, 'completed');
    assert.equal(fixed.length, 3);
  } finally { database.close(); }
}

async function testAdminAndPublicPiiRedaction() {
  const database = dbFor('http-admin');
  const emailPlayer = database.registerConfirmedParticipant({ nickname: 'PrivateEmail', contactType: 'email', email: 'private-3c@example.test', source: 'admin' });
  assert.equal(emailPlayer.success, true);
  const service = await startServer(database);
  try {
    const publicState = await fetchJson(`${service.baseUrl}/api/v1/tournament/public`);
    assert.equal(publicState.status, 200);
    assert.equal(publicState.text.includes('private-3c@example.test'), false);
    assert.equal(publicState.text.toLowerCase().includes('nostr_pubkey'), false);
    assert.equal(publicState.text.includes('contactType'), false);
    const hall = await fetchJson(`${service.baseUrl}/api/v1/hall-of-fame`);
    assert.equal(hall.status, 200);
    assert.equal(hall.text.includes('private-3c@example.test'), false);
    const unauthorized = await fetchJson(`${service.baseUrl}/api/v1/admin/seasons/${TOURNAMENT.id}`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetchJson(`${service.baseUrl}/api/v1/admin/seasons/${TOURNAMENT.id}`, {
      headers: { Authorization: 'Bearer local-3c-admin-secret' }
    });
    assert.equal(authorized.status, 200);
    assert.equal(authorized.text.includes('private-3c@example.test'), true, 'PII is available only behind admin authentication');
    const adminHtml = await fetch(`${service.baseUrl}/admin`, { headers: { Authorization: 'Bearer local-3c-admin-secret' } });
    assert.equal(adminHtml.status, 200);
    const adminDocument = await adminHtml.text();
    assert.equal(adminDocument.includes('Geschützter Server-Adminbereich'), true);
    assert.equal(adminDocument.includes('/admin/participants/'), true);
    assert.equal(adminDocument.includes('<h2>Matches</h2>'), true);
    const previewFromAdminForm = await fetch(`${service.baseUrl}/admin/draw/preview`, {
      method: 'POST', headers: { Authorization: 'Bearer local-3c-admin-secret' }, redirect: 'manual'
    });
    assert.equal(previewFromAdminForm.status, 303);
    const afterPreview = await fetchJson(`${service.baseUrl}/api/v1/admin/seasons/${TOURNAMENT.id}`, {
      headers: { Authorization: 'Bearer local-3c-admin-secret' }
    });
    assert.equal(afterPreview.body.draw.status, 'preview');
  } finally { await service.stop(); }
}

(async () => {
  testMigrationAndMultiSeason();
  testPreviewLockAndByes();
  testNoShowProgressionTopFourAndHallOfFame();
  await testAdminAndPublicPiiRedaction();
  console.log('PASS phase3c: migration, multi-season, fixed positions, preview/lock, BYEs, no-show/disqualification, progression, top 4, hall of fame, admin and PII redaction verified.');
})().catch((error) => {
  console.error('FAIL phase3c:', error.stack || error.message);
  process.exitCode = 1;
});
