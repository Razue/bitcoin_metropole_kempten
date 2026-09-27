const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { createApp } = require('../app');
const { createDatabase } = require('../db');
const { buildConfirmationMail, buildParticipantMail, sendConfirmationMail, sendParticipantMail } = require('../mail');

const temporaryRoot = path.join(__dirname, '.tmp-phase3b');
fs.rmSync(temporaryRoot, { recursive: true, force: true });
fs.mkdirSync(temporaryRoot, { recursive: true });

function dbFor(name) {
  return createDatabase(path.join(temporaryRoot, name, 'esports.db'));
}

async function startServer(database, { maxRequests = 1000, onParticipantConfirmed } = {}) {
  const app = createApp({
    database,
    registrationEnabled: true,
    allowedOrigin: 'https://razue.github.io',
    confirmationBasePath: 'https://esports.localhost/confirm?token=',
    onParticipantConfirmed,
    // Phase 3B covers the retained future-season confirmation mode explicitly.
    emailConfirmationEnabled: true,
    rateLimitConfig: { windowSeconds: 60, maxRequests }
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
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

function emailStart(database, number) {
  return database.startEmailRegistration({
    nickname: `Pending-${String(number).padStart(3, '0')}`,
    email: `pending-${String(number).padStart(3, '0')}@example.test`
  });
}

function assertSeedState(database) {
  const state = database.getPublicTournament();
  assert.equal(state.confirmedParticipantCount, 3);
  assert.equal(state.availableParticipantPlaces, 29);
  assert.deepEqual(state.fixedBracketPositions, [
    { nickname: 'BitFit', bracketPosition: 4 },
    { nickname: 'FireOverFiat', bracketPosition: 7 },
    { nickname: 'MischaTurm', bracketPosition: 25 }
  ]);
}

async function testNormalRegistrationAndTokenSecurity() {
  const database = dbFor('normal');
  try {
    assertSeedState(database);
    const started = database.startEmailRegistration({
      nickname: 'NormalPlayer', email: ' Normal@Example.Test '
    });
    assert.equal(started.success, true);
    assert.equal(started.email, 'normal@example.test');
    assert.equal(started.registrationNumber, 4);
    assert.equal(started.expiresAt > Math.floor(Date.now() / 1000), true);

    const stored = database._getConfirmationForTest(started.confirmationToken);
    assert.ok(stored);
    assert.notEqual(stored.token_hash, started.confirmationToken, 'raw token must not be stored');
    assert.equal(stored.token_hash, crypto.createHash('sha256').update(started.confirmationToken).digest('hex'));
    assert.equal(stored.used, 0);

    const before = database.getPublicTournament();
    assert.equal(before.confirmedParticipantCount, 3, 'pending is not confirmed');
    assert.equal(before.availableParticipantPlaces, 29, 'pending does not consume confirmed capacity');
    assert.equal(before.participants.some((p) => p.nickname === 'NormalPlayer'), false, 'pending is private');

    const confirmed = database.confirmEmailRegistrationByToken(started.confirmationToken);
    assert.equal(confirmed.success, true);
    assert.equal(confirmed.participant.registrationNumber, 4);
    assert.equal(confirmed.participant.bracketPosition, null);
    const after = database.getPublicTournament();
    assert.equal(after.confirmedParticipantCount, 4);
    assert.equal(after.availableParticipantPlaces, 28);
  } finally {
    database.close();
  }
}

async function testInvalidExpiredAndUsedTokens() {
  const database = dbFor('tokens');
  try {
    assert.equal(database.confirmEmailRegistrationByToken('wrong-token').reason, 'invalid_token');

    const expired = database.startEmailRegistration({ nickname: 'Expired', email: 'expired@example.test' });
    database._expireConfirmationForTest(expired.confirmationToken);
    assert.equal(database.confirmEmailRegistrationByToken(expired.confirmationToken).reason, 'token_expired');
    assert.equal(database._allForTest().some((p) => p.nickname === 'Expired'), false, 'expired pending must be cleaned');

    const used = database.startEmailRegistration({ nickname: 'Used', email: 'used@example.test' });
    assert.equal(database.confirmEmailRegistrationByToken(used.confirmationToken).success, true);
    assert.equal(database.confirmEmailRegistrationByToken(used.confirmationToken).reason, 'token_already_used');
  } finally {
    database.close();
  }
}

async function testDuplicateProtectionAndExpiryCleanup() {
  const database = dbFor('duplicates');
  try {
    const first = database.startEmailRegistration({ nickname: 'SameNick', email: 'same@example.test' });
    assert.equal(first.success, true);

    assert.throws(
      () => database.startEmailRegistration({ nickname: 'OtherNick', email: 'SAME@example.test' }),
      /UNIQUE constraint failed.*email/
    );
    assert.throws(
      () => database.startEmailRegistration({ nickname: 'SameNick', email: 'other@example.test' }),
      /UNIQUE constraint failed.*nickname_key/
    );

    database._expireConfirmationForTest(first.confirmationToken);
    // A new start transaction cleans the expired pending record, then accepts the same identifiers.
    const retried = database.startEmailRegistration({ nickname: 'SameNick', email: 'same@example.test' });
    assert.equal(retried.success, true);
  } finally {
    database.close();
  }
}

async function testUnlimitedPendingDoesNotConsumeCapacity() {
  const database = dbFor('pending');
  try {
    const pending = Array.from({ length: 100 }, (_, index) => emailStart(database, index + 1));
    assert.equal(pending.filter((result) => result.success).length, 100, '100 pending registrations must be accepted');

    const state = database.getPublicTournament();
    assert.equal(state.confirmedParticipantCount, 3);
    assert.equal(state.availableParticipantPlaces, 29);
    assert.equal(state.participants.length, 3);
  } finally {
    database.close();
  }
}

async function testExactly29ConfirmationsThenCapacityReached() {
  const database = dbFor('capacity');
  try {
    const pending = Array.from({ length: 30 }, (_, index) => emailStart(database, index + 1));
    for (const item of pending.slice(0, 29)) {
      assert.equal(database.confirmEmailRegistrationByToken(item.confirmationToken).success, true);
    }

    const full = database.getPublicTournament();
    assert.equal(full.confirmedParticipantCount, 32);
    assert.equal(full.availableParticipantPlaces, 0);

    const rejected = database.confirmEmailRegistrationByToken(pending[29].confirmationToken);
    assert.equal(rejected.success, false);
    assert.equal(rejected.reason, 'capacity_reached');
    const tokenStillUsable = database._getConfirmationForTest(pending[29].confirmationToken);
    assert.equal(tokenStillUsable.used, 0, 'capacity rejection must not consume token');
  } finally {
    database.close();
  }
}

async function test100ParallelConfirmationRequests() {
  const database = dbFor('parallel');
  const pending = Array.from({ length: 100 }, (_, index) => emailStart(database, index + 1));
  const service = await startServer(database);
  try {
    const outcomes = await Promise.all(pending.map((item) => fetchJson(
      `${service.baseUrl}/api/v1/registrations/email/confirm?token=${item.confirmationToken}`
    )));
    assert.equal(outcomes.filter((outcome) => outcome.status === 200).length, 29);
    assert.equal(outcomes.filter((outcome) => outcome.status === 409 && outcome.body.error === 'capacity_reached').length, 71);

    const state = await fetchJson(`${service.baseUrl}/api/v1/tournament/public`);
    assert.equal(state.status, 200);
    assert.equal(state.body.confirmedParticipantCount, 32);
    assert.equal(state.body.availableParticipantPlaces, 0);
    assert.equal(state.body.participants.length, 32);
    assert.equal(state.body.participants.filter((p) => p.bracketPosition !== null).length, 3);
    assert.equal(state.body.confirmedParticipantCount <= 32, true, 'no 33rd participant can be confirmed');
  } finally {
    await service.stop();
  }
}

async function testPublicApiAndMailAdapter() {
  const database = dbFor('privacy');
  try {
    const pending = database.startEmailRegistration({ nickname: 'PrivatePending', email: 'private@example.test' });
    const state = database.getPublicTournament();
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes('private@example.test'), false);
    assert.equal(serialized.includes(pending.confirmationToken), false);
    assert.equal(serialized.toLowerCase().includes('token_hash'), false);
    assert.equal(serialized.toLowerCase().includes('nostr_pubkey'), false);

    const confirmationMail = await sendConfirmationMail({
      to: 'recipient@example.test', nickname: 'MailTest', confirmationUrl: 'https://example.test/confirm?token=abc'
    });
    const participantMail = await sendParticipantMail({
      to: 'recipient@example.test', nickname: 'MailTest', registrationNumber: 4
    });
    assert.equal(confirmationMail.success, false);
    assert.equal(confirmationMail.deliveryReason, 'disabled');
    assert.equal(participantMail.success, false);
    assert.equal(participantMail.deliveryReason, 'disabled');
    assert.equal(buildConfirmationMail({ to: 'x@example.test', nickname: 'MailTest', confirmationUrl: 'https://example.test/c' }).subject,
      '21 eSports Pokal – E-Mail bestätigen');
    assert.equal(buildParticipantMail({ to: 'x@example.test', nickname: 'MailTest', registrationNumber: 4 }).body.includes('Du bist dabei!'), true);
  } finally {
    database.close();
  }
}

async function testRateLimitAndHttpFlow() {
  const database = dbFor('http');
  const sent = [];
  const service = await startServer(database, {
    maxRequests: 3,
    onParticipantConfirmed: (participant) => sent.push(participant)
  });
  try {
    const requests = await Promise.all(Array.from({ length: 4 }, (_, index) => fetchJson(
      `${service.baseUrl}/api/v1/registrations/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `Rate-${index}`, email: `rate-${index}@example.test` })
      }
    )));
    assert.equal(requests.filter((request) => request.status === 202).length, 3);
    assert.equal(requests.filter((request) => request.status === 429).length, 1);

    // The callback runs exactly once after a successful HTTP confirmation.
    const token = database._allForTest().find((p) => p.nickname === 'Rate-0');
    assert.ok(token);
    const started = database.startEmailRegistration({ nickname: 'Callback', email: 'callback@example.test' });
    const confirmation = await fetchJson(`${service.baseUrl}/api/v1/registrations/email/confirm?token=${started.confirmationToken}`);
    assert.equal(confirmation.status, 200);
    assert.equal(sent.length, 1);
  } finally {
    await service.stop();
  }
}

(async () => {
  await testNormalRegistrationAndTokenSecurity();
  await testInvalidExpiredAndUsedTokens();
  await testDuplicateProtectionAndExpiryCleanup();
  await testUnlimitedPendingDoesNotConsumeCapacity();
  await testExactly29ConfirmationsThenCapacityReached();
  await test100ParallelConfirmationRequests();
  await testPublicApiAndMailAdapter();
  await testRateLimitAndHttpFlow();
  console.log('PASS phase3b: confirmed-only capacity, pending cleanup, token safety, 100 parallel confirmations, PII and mail tests verified.');
})().catch((error) => {
  console.error('FAIL phase3b:', error.stack || error.message);
  process.exitCode = 1;
});
