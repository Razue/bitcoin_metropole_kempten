const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { createApp } = require('../app');
const { createDatabase } = require('../db');

const temporaryRoot = path.join(__dirname, '.tmp');
fs.rmSync(temporaryRoot, { recursive: true, force: true });
fs.mkdirSync(temporaryRoot, { recursive: true });

async function startServer(database, registrationEnabled) {
  const app = createApp({
    database,
    registrationEnabled,
    allowedOrigin: 'https://razue.github.io'
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      server.close();
      await once(server, 'close');
      database.close();
    }
  };
}

async function readJson(response) {
  const body = await response.json();
  return { status: response.status, body };
}

async function testSeedAndParallelCapacity() {
  const database = createDatabase(path.join(temporaryRoot, 'capacity', 'esports.db'));

  // Idempotence: startup already seeded; a second run must preserve exactly the same three people.
  database.seedInitialParticipants();
  const seeded = database.getPublicTournament();
  assert.equal(seeded.confirmedParticipantCount, 3);
  assert.equal(seeded.availableParticipantPlaces, 29);
  assert.deepEqual(seeded.fixedBracketPositions, [
    { nickname: 'BitFit', bracketPosition: 4 },
    { nickname: 'FireOverFiat', bracketPosition: 7 },
    { nickname: 'MischaTurm', bracketPosition: 25 }
  ]);

  const service = await startServer(database, true);
  try {
    const registrations = await Promise.all(
      Array.from({ length: 100 }, (_, index) => fetch(`${service.baseUrl}/api/v1/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `Parallel-${String(index + 1).padStart(3, '0')}` })
      }).then(readJson))
    );

    const accepted = registrations.filter((result) => result.status === 201);
    const full = registrations.filter((result) => result.status === 409 && result.body.error === 'capacity_reached');
    assert.equal(accepted.length, 29, 'only 29 seats may be accepted after the three seeded participants');
    assert.equal(full.length, 71, 'all remaining simultaneous requests must be rejected as full');

    for (const result of accepted) {
      assert.equal(result.body.participant.bracketPosition, null, 'registration must not assign a bracket position');
      assert.ok(result.body.participant.registrationNumber >= 4);
      assert.ok(result.body.participant.registrationNumber <= 32, 'participant #33 must never be confirmed');
    }

    const state = await fetch(`${service.baseUrl}/api/v1/tournament/public`).then(readJson);
    assert.equal(state.status, 200);
    assert.equal(state.body.confirmedParticipantCount, 32);
    assert.equal(state.body.availableParticipantPlaces, 0);
    assert.equal(state.body.participants.length, 32);
    assert.equal(Math.max(...state.body.participants.map((participant) => participant.registrationNumber)), 32);
    assert.equal(state.body.fixedBracketPositions.length, 3);
    assert.deepEqual(state.body.fixedBracketPositions, [
      { nickname: 'BitFit', bracketPosition: 4 },
      { nickname: 'FireOverFiat', bracketPosition: 7 },
      { nickname: 'MischaTurm', bracketPosition: 25 }
    ]);
    assert.equal(
      state.body.participants.filter((participant) => participant.registrationNumber > 3 && participant.bracketPosition !== null).length,
      0,
      'online/core registrations must remain without bracket positions until the future final draw'
    );
  } finally {
    await service.stop();
  }
}

async function testPublicApiRedaction() {
  const database = createDatabase(path.join(temporaryRoot, 'redaction', 'esports.db'));
  const stored = database.registerConfirmedParticipant({
    nickname: 'PrivateContactTest',
    contactType: 'email',
    email: 'private-contact@example.test',
    source: 'admin'
  });
  assert.equal(stored.success, true);

  const service = await startServer(database, false);
  try {
    const publicResponse = await fetch(`${service.baseUrl}/api/v1/tournament/public`);
    const serialized = await publicResponse.text();
    assert.equal(publicResponse.status, 200);
    assert.equal(serialized.includes('private-contact@example.test'), false, 'email must not leak through public API');
    assert.equal(serialized.includes('email'), false, 'public API must not expose an email field');
    assert.equal(serialized.includes('nostr_pubkey'), false, 'public API must not expose a Nostr pubkey field');
    assert.equal(serialized.includes('contactType'), false, 'public API must not expose contact metadata');

    const disabledRegistration = await fetch(`${service.baseUrl}/api/v1/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'MustNotRegister' })
    }).then(readJson);
    assert.equal(disabledRegistration.status, 403);
    assert.equal(disabledRegistration.body.error, 'registration_disabled');
  } finally {
    await service.stop();
  }
}

(async () => {
  await testSeedAndParallelCapacity();
  await testPublicApiRedaction();
  console.log('PASS phase3a: seed, public API redaction, and 100 parallel registration requests are verified.');
})().catch((error) => {
  console.error('FAIL phase3a:', error.stack || error.message);
  process.exitCode = 1;
});
