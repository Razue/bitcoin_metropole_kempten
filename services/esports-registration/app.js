const path = require('path');
const { sendConfirmationMail } = require('./mail');

function createInMemoryRateLimiter({ windowSeconds = 60, maxRequests = 10 } = {}) {
  const windowMs = windowSeconds * 1000;
  const counters = new Map();

  return function rateLimit(endpoint) {
    return (_req, res, next) => {
      // Global, process-local protection only: no IP address or identifier is retained.
      const now = Date.now();
      const current = counters.get(endpoint);
      if (!current || now - current.windowStart >= windowMs) {
        counters.set(endpoint, { windowStart: now, count: 1 });
        return next();
      }
      if (current.count >= maxRequests) {
        return res.status(429).json({ error: 'rate_limited' });
      }
      current.count += 1;
      return next();
    };
  };
}

function createApp({
  database,
  registrationEnabled = false,
  allowedOrigin = 'https://razue.github.io',
  confirmationBasePath = 'https://esports.localhost/confirm?token=',
  onParticipantConfirmed,
  rateLimitConfig
}) {
  const express = require('express');
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

  const rateLimiter = createInMemoryRateLimiter(rateLimitConfig);

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

  // Phase 3A core endpoint kept intact.
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

  // Phase 3B: pending email registration.
  app.post('/api/v1/registrations/email', rateLimiter('email-start'), async (req, res, next) => {
    if (!registrationEnabled) {
      return res.status(403).json({ error: 'registration_disabled' });
    }

    try {
      const body = req.body || {};
      const started = database.startEmailRegistration({
        nickname: body.nickname,
        email: body.email
      });

      if (!started.success) {
        const status = {
          capacity_reached: 409,
          registration_closed: 403
        }[started.reason] || 409;
        return res.status(status).json({ error: started.reason });
      }

      const confirmationUrl = confirmationBasePath + started.confirmationToken;
      await sendConfirmationMail({
        to: started.email,
        nickname: started.nickname,
        confirmationUrl,
        eventDate: '2026-10-18',
        startTime: '10:00'
      });

      return res.status(202).json({
        registrationNumber: started.registrationNumber,
        expiresAt: started.expiresAt
      });
    } catch (error) {
      if (error.message === 'invalid_nickname' || error.message === 'invalid_email') {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('nickname_key')) {
          return res.status(409).json({ error: 'nickname_registered' });
        }
        if (error.message.includes('email')) {
          return res.status(409).json({ error: 'email_registered' });
        }
        return res.status(409).json({ error: 'already_registered' });
      }
      return next(error);
    }
  });

  // Phase 3B: confirmation endpoint.
  app.get('/api/v1/registrations/email/confirm', rateLimiter('email-confirm'), async (req, res, next) => {
    if (!registrationEnabled) {
      return res.status(403).json({ error: 'registration_disabled' });
    }

    try {
      const token = req.query && req.query.token;
      const result = database.confirmEmailRegistrationByToken(token);

      if (!result.success) {
        const status = {
          invalid_token: 404,
          token_expired: 410,
          token_already_used: 410,
          capacity_reached: 409,
          participant_missing: 404
        }[result.reason] || 400;
        return res.status(status).json({ error: result.reason });
      }

      if (typeof onParticipantConfirmed === 'function') {
        try {
          await onParticipantConfirmed({
            email: result.participant.email,
            nickname: result.participant.nickname,
            registrationNumber: result.participant.registrationNumber
          });
        } catch (mailError) {
          console.error('eSports service: participant mail failed:', mailError.message);
        }
      }

      return res.status(200).json({ participant: result.participant });
    } catch (error) {
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
