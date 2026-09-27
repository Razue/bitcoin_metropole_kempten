const path = require('path');

/**
 * Mail adapter for Phase 3B.
 *
 * Contract:
 *   sendConfirmationMail({ to, nickname, confirmationUrl, eventDate, startTime }) -> Promise<{ success: boolean, externalId?: string }>
 *   sendParticipantMail({ to, nickname, registrationNumber, eventDate, startTime, prizes }) -> Promise<{ success: boolean, externalId?: string }>
 *
 * The adapter is intentionally inert by default. Set MAIL_DELIVERY_ENABLED=true together with a
 * real MAIL_PROVIDER, MAIL_API_KEY, MAIL_FROM and MAIL_BASE_URL to enable actual outbound delivery.
 * Until then every "send" resolves with success=false and deliveryReason='disabled', so no real
 * email leaves the machine during local testing.
 */

const DEFAULT_SENDER = 'no-reply@bitcoinmetropole.de';

function resolveConfig() {
  const deliveryEnabled = process.env.MAIL_DELIVERY_ENABLED === 'true';
  return {
    deliveryEnabled,
    provider: process.env.MAIL_PROVIDER || '',
    apiKey: process.env.MAIL_API_KEY || '',
    from: process.env.MAIL_FROM || DEFAULT_SENDER,
    baseUrl: process.env.MAIL_BASE_URL || '',
  };
}

function buildConfirmationMail({ to, nickname, confirmationUrl, eventDate, startTime }) {
  const subject = '21 eSports Pokal – E-Mail bestätigen';
  const body = [
    'Hallo ' + (nickname || 'Teilnehmer'),
    '',
    'Bestätige deine Anmeldung für den 21 eSports Pokal – EA SPORTS FC Season 1.',
    '',
    'Dieser Link ist 30 Minuten gültig:',
    confirmationUrl,
    '',
    '18. Oktober 2026 · 10:00 Uhr',
    'Bitcoin Metropole Kempten',
    '',
    'Preise:',
    '1. Platz — 150 € in Satoshis',
    '2. Platz — 100 € in Satoshis',
    '3. Platz — 50 € in Satoshis',
    '4. Platz — 50 € in Satoshis',
  ].join('\n');
  return { to, from: resolveConfig().from, subject, body, eventDate, startTime };
}

function buildParticipantMail({ to, nickname, registrationNumber, eventDate, startTime, prizes }) {
  const subject = '21 eSports Pokal – Teilnahmebestätigung';
  const prizeLines = (prizes || [
    '1. Platz — 150 € in Satoshis',
    '2. Platz — 100 € in Satoshis',
    '3. Platz — 50 € in Satoshis',
    '4. Platz — 50 € in Satoshis'
  ]).map(p => '- ' + p).join('\n');
  const body = [
    'Du bist dabei!',
    '',
    'Nickname: ' + nickname,
    'Teilnehmernummer: ' + registrationNumber,
    '18. Oktober 2026 · 10:00 Uhr',
    'Bitcoin Metropole Kempten',
    '',
    'Preise:',
    prizeLines,
    '',
    'Der genaue Check-in- und Spielzeitplan folgt später.',
  ].join('\n');
  return { to, from: resolveConfig().from, subject, body, eventDate, startTime };
}

async function sendConfirmationMail(payload) {
  const config = resolveConfig();
  if (!config.deliveryEnabled) {
    return { success: false, deliveryReason: 'disabled', envelope: buildConfirmationMail(payload) };
  }
  return dispatchMail(config, buildConfirmationMail(payload));
}

async function sendParticipantMail(payload) {
  const config = resolveConfig();
  if (!config.deliveryEnabled) {
    return { success: false, deliveryReason: 'disabled', envelope: buildParticipantMail(payload) };
  }
  return dispatchMail(config, buildParticipantMail(payload));
}

async function dispatchMail(config, envelope) {
  switch (config.provider) {
    case 'smtp':
      return dispatchSmtp(config, envelope);
    case 'api':
      return dispatchApi(config, envelope);
    default:
      return { success: false, deliveryReason: 'provider_not_configured', envelope };
  }
}

async function dispatchSmtp(config, envelope) {
  // Lazy require so absent transports do not break the inert default.
  // Not implemented in Phase 3B; left as a placeholder.
  return { success: false, deliveryReason: 'smtp_not_configured', envelope };
}

async function dispatchApi(config, envelope) {
  if (!config.apiKey || !config.baseUrl) {
    return { success: false, deliveryReason: 'smtp_not_configured', envelope };
  }
  // Placeholder for a future HTTPS mail API. Phase 3B keeps delivery disabled by default.
  return { success: false, deliveryReason: 'api_not_configured', envelope };
}

module.exports = {
  buildConfirmationMail,
  buildParticipantMail,
  sendConfirmationMail,
  sendParticipantMail
};
