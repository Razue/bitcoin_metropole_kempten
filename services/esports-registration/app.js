const express = require('express');

function createApp({ database, registrationEnabled = false, allowedOrigin = 'https://razue.github.io' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    const origin = req.headers.origin;
    if (origin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.get('/health', (_req, res) => {
    const state = database.getPublicTournament();
    res.json({
      status: 'ok',
      confirmedParticipantCount: state.confirmedParticipantCount,
      availableParticipantPlaces: state.availableParticipantPlaces
    });
  });

  app.get('/api/v1/tournament/public', (_req, res) => {
    // This mapper is intentionally defined by the database layer with explicit public fields only.
    res.json(database.getPublicTournament());
  });

  // Phase 3A core endpoint: not connected to the frontend and disabled by default in production.
  // Email and Nostr routes are intentionally not implemented in this phase.
  app.post('/api/v1/registrations', (req, res, next) => {
    if (!registrationEnabled) {
      return res.status(403).json({ error: 'registration_disabled' });
    }

    try {
      const result = database.registerConfirmedParticipant({
        nickname: req.body && req.body.nickname,
        contactType: 'manual',
        source: 'core_registration'
      });
      if (!result.success) {
        const status = result.reason === 'capacity_reached' ? 409 : 403;
        return res.status(status).json({ error: result.reason });
      }
      return res.status(201).json({ participant: result.participant });
    } catch (error) {
      if (error.message === 'invalid_nickname') {
        return res.status(400).json({ error: 'invalid_nickname' });
      }
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'already_registered' });
      }
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error('eSports service error:', error.message);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

module.exports = { createApp };
