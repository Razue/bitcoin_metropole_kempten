const path = require('path');
const { createApp } = require('./app');
const { createDatabase } = require('./db');
const { sendParticipantMail } = require('./mail');

async function onParticipantConfirmed({ email, nickname, registrationNumber }) {
  if (!email) return;
  // Real delivery is inert by default (MAIL_DELIVERY_ENABLED=false).
  await sendParticipantMail({
    to: email,
    nickname,
    registrationNumber,
    from: process.env.MAIL_FROM || undefined,
  });
}

const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '3001', 10);
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'esports.db');
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://razue.github.io';
const registrationEnabled = process.env.REGISTRATION_ENABLED === 'true';
// FC Season 1 defaults to direct confirmation. Future seasons may explicitly opt in.
const emailConfirmationEnabled = process.env.EMAIL_CONFIRMATION_ENABLED === 'true';
const rateLimitConfig = {
  windowSeconds: Number.parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '60', 10),
  maxRequests: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10)
};

const database = createDatabase(dbPath);
const app = createApp({
  database,
  registrationEnabled,
  allowedOrigin,
  onParticipantConfirmed,
  rateLimitConfig,
  // Empty by default: admin endpoints fail closed until a deployment supplies ADMIN_SECRET.
  adminSecret: process.env.ADMIN_SECRET || '',
  emailConfirmationEnabled
});

const server = app.listen(port, host, () => {
  console.log(`eSports registration backend listening on ${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
