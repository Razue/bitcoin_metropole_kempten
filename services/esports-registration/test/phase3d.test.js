const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { createApp } = require('../app');
const { createDatabase, TOURNAMENT } = require('../db');

const temporaryRoot = path.join(__dirname, '.tmp-phase3d');
fs.rmSync(temporaryRoot, { recursive: true, force: true });
fs.mkdirSync(temporaryRoot, { recursive: true });

function dbFor(name) {
  return createDatabase(path.join(temporaryRoot, name, 'esports.db'));
}

async function startServer(database, { onParticipantConfirmed } = {}) {
  const app = createApp({
    database,
    registrationEnabled: true,
    allowedOrigin: 'https://razue.github.io',
    adminSecret: 'phase3d-local-admin-secret',
    onParticipantConfirmed,
    rateLimitConfig: { windowSeconds: 60, maxRequests: 1000 }
  });
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
  return { status: response.status, body: await response.json() };
}

function registrationRequest(baseUrl, nickname, email) {
  return fetchJson(`${baseUrl}/api/v1/registrations/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, email })
  });
}

async function testDirectRegistrationAndParallelCapacity() {
  const database = dbFor('parallel');
  let automaticMailCallbacks = 0;
  const service = await startServer(database, { onParticipantConfirmed: () => { automaticMailCallbacks += 1; } });
  try {
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => registrationRequest(
      service.baseUrl,
      `Direct-${String(index + 1).padStart(3, '0')}`,
      `direct-${String(index + 1).padStart(3, '0')}@example.test`
    )));
    const accepted = results.filter((result) => result.status === 201);
    const full = results.filter((result) => result.status === 409 && result.body.error === 'capacity_reached');
    assert.equal(accepted.length, 29, 'only the 29 free Season 1 places may be confirmed');
    assert.equal(full.length, 71, 'every overflow request must receive capacity_reached');
    accepted.forEach((result) => {
      assert.equal(result.body.participant.status, 'confirmed');
      assert.equal(result.body.participant.bracketPosition, null);
      assert.equal(Object.hasOwn(result.body.participant, 'confirmationToken'), false);
      assert.ok(result.body.participant.registrationNumber >= 4 && result.body.participant.registrationNumber <= 32);
    });
    assert.equal(automaticMailCallbacks, 0, 'direct Season 1 registration must not trigger an automatic mail callback');

    const publicState = await fetchJson(`${service.baseUrl}/api/v1/tournament/public`);
    assert.equal(publicState.status, 200);
    assert.equal(publicState.body.confirmedParticipantCount, 32);
    assert.equal(publicState.body.availableParticipantPlaces, 0);
    assert.equal(publicState.body.participants.length, 32);
    assert.equal(Math.max(...publicState.body.participants.map((participant) => participant.registrationNumber)), 32, 'participant #33 must never exist');
    assert.equal(publicState.body.participants.some((participant) => participant.bracketPosition !== null && participant.registrationNumber > 3), false,
      'direct registrations must not receive a bracket position');
    assert.equal(JSON.stringify(publicState.body).includes('@example.test'), false, 'email must remain private in the public API');

    const adminState = await fetchJson(`${service.baseUrl}/api/v1/admin/seasons/${TOURNAMENT.id}`, {
      headers: { Authorization: 'Bearer phase3d-local-admin-secret' }
    });
    assert.equal(adminState.status, 200);
    assert.equal(adminState.body.participants.some((participant) => participant.email === 'direct-001@example.test'), true,
      'the authenticated admin may view the private email');

    const disabledConfirmation = await fetchJson(`${service.baseUrl}/api/v1/registrations/email/confirm?token=unused`);
    assert.equal(disabledConfirmation.status, 410);
    assert.equal(disabledConfirmation.body.error, 'email_confirmation_disabled');
  } finally {
    await service.stop();
  }
}

async function testDuplicateProtection() {
  const database = dbFor('duplicates');
  const service = await startServer(database);
  try {
    const first = await registrationRequest(service.baseUrl, 'DuplicateNick', 'duplicate@example.test');
    assert.equal(first.status, 201);
    assert.equal(first.body.participant.status, 'confirmed');

    const duplicateNickname = await registrationRequest(service.baseUrl, 'DuplicateNick', 'different@example.test');
    assert.equal(duplicateNickname.status, 409);
    assert.equal(duplicateNickname.body.error, 'nickname_registered');

    const duplicateEmail = await registrationRequest(service.baseUrl, 'DifferentNick', 'DUPLICATE@example.test');
    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.body.error, 'email_registered');

    const state = await fetchJson(`${service.baseUrl}/api/v1/tournament/public`);
    assert.equal(state.body.confirmedParticipantCount, 4);
    assert.equal(state.body.participants.find((participant) => participant.nickname === 'DuplicateNick').bracketPosition, null);
  } finally {
    await service.stop();
  }
}

function testFrontendCopyAndNostrBoundary() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const html = fs.readFileSync(path.join(projectRoot, 'esports.html'), 'utf8');
  const script = fs.readFileSync(path.join(projectRoot, 'esports.js'), 'utf8');
  assert.equal(html.includes('Kontakt: <a href="mailto:bitcoinmetropole@proton.me">bitcoinmetropole@proton.me</a>'), true);
  assert.equal(script.includes('Du bist dabei! Dein Platz beim 21 eSports Pokal – FC Season 1 ist gesichert.'), true);
  assert.equal(script.includes('await refreshPublicState();'), true);
  assert.equal(script.includes('confirmed-player-list'), true);
  assert.equal(script.includes('replaceChildren'), true);
  assert.equal(html.includes('Bestätige anschließend den Link'), false);
  assert.equal(script.includes('Prüfe dein E-Mail-Postfach'), false);
  assert.equal(html.includes('MIT NOSTR ANMELDEN · COMING SOON</button>'), true);
  assert.equal(html.includes('id="nostr-registration-preview" disabled'), true);
  assert.equal(script.includes('nostr-registration-preview'), false, 'Nostr must have no frontend behavior');
}

(async () => {
  await testDirectRegistrationAndParallelCapacity();
  await testDuplicateProtection();
  testFrontendCopyAndNostrBoundary();
  console.log('PASS phase3d: direct Season 1 confirmation, 100 parallel capacity, duplicates, privacy/admin visibility, disabled confirmation and frontend copy verified.');
})().catch((error) => {
  console.error('FAIL phase3d:', error.stack || error.message);
  process.exitCode = 1;
});
