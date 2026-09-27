const crypto = require('crypto');
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
      if (current.count >= maxRequests) return res.status(429).json({ error: 'rate_limited' });
      current.count += 1;
      return next();
    };
  };
}

function isAdminAuthorized(req, adminSecret) {
  if (!adminSecret || typeof adminSecret !== 'string') return false;
  const value = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(adminSecret);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function adminPage(state) {
  const participantRows = state.participants.map((participant) => `<tr>
    <td>${participant.registrationNumber}</td><td>${escapeHtml(participant.nickname)}</td>
    <td><form method="post" action="/admin/participants/${escapeHtml(participant.id)}/status"><select name="status">${['confirmed', 'no_show', 'disqualified', 'withdrawn'].map((status) => `<option value="${status}"${participant.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select><button type="submit">Speichern</button></form></td>
    <td>${participant.bracketPosition || '—'}${participant.fixedBracketPosition ? ' · fixed' : ''}</td>
    <td>${escapeHtml(participant.contactType)}</td><td>${escapeHtml(participant.email || participant.nostrPubkey || '—')}</td>
  </tr>`).join('');
  const matchRows = state.matches.map((match) => {
    const controls = match.state === 'pending' && match.participantOne && match.participantTwo
      ? `<form method="post" action="/admin/matches/${escapeHtml(match.id)}/result"><select name="winnerId"><option value="${escapeHtml(match.participantOne.id)}">${escapeHtml(match.participantOne.nickname)}</option><option value="${escapeHtml(match.participantTwo.id)}">${escapeHtml(match.participantTwo.nickname)}</option></select><button type="submit">Ergebnis speichern</button></form>`
      : '—';
    return `<tr><td>${escapeHtml(match.stage)} R${match.round} #${match.number}</td>
      <td>${escapeHtml(match.participantOne?.nickname || 'BYE')} – ${escapeHtml(match.participantTwo?.nickname || 'BYE')}</td>
      <td>${escapeHtml(match.winner?.nickname || '—')}</td><td>${escapeHtml(match.state)}</td><td>${controls}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>21 eSports · Admin</title><style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:1100px;background:#10151d;color:#edf3fb}table{border-collapse:collapse;width:100%;margin:1rem 0}td,th{padding:.45rem;border:1px solid #42505f;text-align:left}button{padding:.6rem 1rem;margin-right:.5rem}section{margin:2rem 0;padding:1rem;border:1px solid #42505f}small{color:#b9c5d2}</style></head><body>
    <h1>21 eSports · ${escapeHtml(state.season?.label || 'Admin')}</h1><p>Geschützter Server-Adminbereich. Persönliche Kontaktdaten erscheinen ausschließlich nach Bearer-Authentifizierung.</p>
    <section><h2>Draw</h2><p>Status: ${escapeHtml(state.tournament.bracketStatus)} · ${escapeHtml(state.draw?.status || 'kein Draw')}</p>
    <form method="post" action="/admin/draw/preview"><button type="submit">Draw-Vorschau erzeugen</button></form>
    <form method="post" action="/admin/draw/lock"><button type="submit">Vorschau verbindlich sperren</button></form></section>
    <section><h2>Teilnehmer</h2><table><thead><tr><th>#</th><th>Nickname</th><th>Status</th><th>Position</th><th>Kontakt</th><th>Admin-Kontaktwert</th></tr></thead><tbody>${participantRows}</tbody></table></section>
    <section><h2>Matches</h2><table><thead><tr><th>Match</th><th>Teilnehmer</th><th>Sieger</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${matchRows}</tbody></table></section>
    <section><h2>Abschluss</h2><form method="post" action="/admin/season/complete"><button type="submit">Season abschließen</button></form><small>Nur möglich, wenn Finale und Spiel um Platz 3 aufgelöst sind.</small></section>
  </body></html>`;
}

function createApp({
  database,
  registrationEnabled = false,
  allowedOrigin = 'https://razue.github.io',
  confirmationBasePath = 'https://esports.localhost/confirm?token=',
  onParticipantConfirmed,
  rateLimitConfig,
  adminSecret = ''
}) {
  const express = require('express');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  const rateLimiter = createInMemoryRateLimiter(rateLimitConfig);
  const requireAdmin = (req, res, next) => {
    if (!isAdminAuthorized(req, adminSecret)) return res.status(401).json({ error: 'admin_unauthorized' });
    return next();
  };
  const currentSeasonId = (req) => (req.params && req.params.seasonId) || (req.body && req.body.seasonId) || undefined;

  app.get('/health', (_req, res) => {
    const state = database.getPublicTournament();
    res.json({ status: 'ok', confirmedParticipantCount: state.confirmedParticipantCount,
      availableParticipantPlaces: state.availableParticipantPlaces });
  });
  app.get('/api/v1/tournament/public', (_req, res) => res.json(database.getPublicTournament()));
  app.get('/api/v1/hall-of-fame', (_req, res) => res.json(database.getHallOfFame()));

  // Phase 3A core endpoint kept intact.
  app.post('/api/v1/registrations', (req, res, next) => {
    if (!registrationEnabled) return res.status(403).json({ error: 'registration_disabled' });
    try {
      const result = database.registerConfirmedParticipant({ nickname: req.body && req.body.nickname, contactType: 'manual', source: 'core_registration' });
      if (!result.success) return res.status(result.reason === 'capacity_reached' ? 409 : 403).json({ error: result.reason });
      return res.status(201).json({ participant: result.participant });
    } catch (error) {
      if (error.message === 'invalid_nickname') return res.status(400).json({ error: 'invalid_nickname' });
      if (error.message.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'already_registered' });
      return next(error);
    }
  });

  // Phase 3B: pending email registration. The mail adapter remains inert unless separately enabled.
  app.post('/api/v1/registrations/email', rateLimiter('email-start'), async (req, res, next) => {
    if (!registrationEnabled) return res.status(403).json({ error: 'registration_disabled' });
    try {
      const started = database.startEmailRegistration({ nickname: req.body?.nickname, email: req.body?.email });
      if (!started.success) return res.status({ capacity_reached: 409, registration_closed: 403 }[started.reason] || 409).json({ error: started.reason });
      await sendConfirmationMail({ to: started.email, nickname: started.nickname,
        confirmationUrl: confirmationBasePath + started.confirmationToken, eventDate: '2026-10-18', startTime: '10:00' });
      return res.status(202).json({ registrationNumber: started.registrationNumber, expiresAt: started.expiresAt });
    } catch (error) {
      if (error.message === 'invalid_nickname' || error.message === 'invalid_email') return res.status(400).json({ error: error.message });
      if (error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('nickname_key')) return res.status(409).json({ error: 'nickname_registered' });
        if (error.message.includes('email')) return res.status(409).json({ error: 'email_registered' });
        return res.status(409).json({ error: 'already_registered' });
      }
      return next(error);
    }
  });

  app.get('/api/v1/registrations/email/confirm', rateLimiter('email-confirm'), async (req, res, next) => {
    if (!registrationEnabled) return res.status(403).json({ error: 'registration_disabled' });
    try {
      const result = database.confirmEmailRegistrationByToken(req.query?.token);
      if (!result.success) return res.status({ invalid_token: 404, token_expired: 410, token_already_used: 410,
        capacity_reached: 409, participant_missing: 404 }[result.reason] || 400).json({ error: result.reason });
      if (typeof onParticipantConfirmed === 'function') {
        try { await onParticipantConfirmed({ email: result.participant.email, nickname: result.participant.nickname,
          registrationNumber: result.participant.registrationNumber });
        } catch (mailError) { console.error('eSports service: participant mail failed:', mailError.message); }
      }
      return res.status(200).json({ participant: result.participant });
    } catch (error) { return next(error); }
  });

  // Phase 3C server-side admin controls. All PII-bearing responses are behind Bearer ADMIN_SECRET.
  app.get('/api/v1/admin/seasons/:seasonId', requireAdmin, (req, res, next) => {
    try { return res.json(database.getAdminSeason(currentSeasonId(req))); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/seasons', requireAdmin, (req, res, next) => {
    try { return res.status(201).json(database.createSeason(req.body || {})); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/draw/preview', requireAdmin, (req, res, next) => {
    try { return res.status(201).json(database.createDrawPreview(currentSeasonId(req))); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/draw/lock', requireAdmin, (req, res, next) => {
    try { return res.json(database.lockDraw(currentSeasonId(req))); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/participants/:participantId/status', requireAdmin, (req, res, next) => {
    try { return res.json(database.setParticipantStatus({ tournamentId: currentSeasonId(req), participantId: req.params.participantId, status: req.body?.status })); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/matches/:matchId/result', requireAdmin, (req, res, next) => {
    try { return res.json(database.recordMatchResult({ tournamentId: currentSeasonId(req), matchId: req.params.matchId, winnerId: req.body?.winnerId })); } catch (error) { return next(error); }
  });
  app.post('/api/v1/admin/seasons/:seasonId/complete', requireAdmin, (req, res, next) => {
    try { return res.json(database.completeSeason(currentSeasonId(req))); } catch (error) { return next(error); }
  });

  app.get('/admin', requireAdmin, (_req, res, next) => {
    try { return res.type('html').send(adminPage(database.getAdminSeason())); } catch (error) { return next(error); }
  });
  app.post('/admin/draw/preview', requireAdmin, (_req, res, next) => {
    try { database.createDrawPreview(); return res.redirect(303, '/admin'); } catch (error) { return next(error); }
  });
  app.post('/admin/draw/lock', requireAdmin, (_req, res, next) => {
    try { database.lockDraw(); return res.redirect(303, '/admin'); } catch (error) { return next(error); }
  });
  app.post('/admin/participants/:participantId/status', requireAdmin, (req, res, next) => {
    try { database.setParticipantStatus({ participantId: req.params.participantId, status: req.body?.status }); return res.redirect(303, '/admin'); } catch (error) { return next(error); }
  });
  app.post('/admin/matches/:matchId/result', requireAdmin, (req, res, next) => {
    try { database.recordMatchResult({ matchId: req.params.matchId, winnerId: req.body?.winnerId }); return res.redirect(303, '/admin'); } catch (error) { return next(error); }
  });
  app.post('/admin/season/complete', requireAdmin, (_req, res, next) => {
    try { database.completeSeason(); return res.redirect(303, '/admin'); } catch (error) { return next(error); }
  });

  app.use((error, _req, res, _next) => {
    const clientErrors = new Set(['draw_already_locked', 'draw_preview_missing', 'fixed_position_changed',
      'match_missing', 'match_already_resolved', 'match_not_ready', 'invalid_match_winner', 'participant_not_eligible', 'season_not_ready',
      'participant_missing', 'tournament_missing', 'season_missing', 'invalid_participant_status', 'invalid_season_id', 'invalid_game_id',
      'invalid_season_number', 'invalid_season']);
    if (clientErrors.has(error.message)) return res.status(409).json({ error: error.message });
    console.error('eSports service error:', error.message);
    return res.status(500).json({ error: 'server_error' });
  });
  return app;
}

module.exports = { createApp };
