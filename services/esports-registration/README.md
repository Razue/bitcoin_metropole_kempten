# 21 eSports registration backend

This is a standalone Node/Express/SQLite service for **21 eSports Pokal – EA SPORTS FC Season 1**. It does not share source files, a database, a port, routes, configuration, or BTCPay code with the Bitcoin-Herbst ticket backend.

## Phase 3A scope

- Separate SQLite schema and idempotent initial seed
- Public tournament endpoint with explicit PII redaction
- Atomic participant-capacity core for 32 confirmed participants
- No email delivery, Nostr login, Nostr messaging, Telegram/Signal links, admin UI, Caddy configuration, systemd unit, deployment, or frontend wiring

A registration has a sequential `registrationNumber`, not a tournament-bracket position. Only the three historic seeded participants have immutable `bracketPosition` values (04, 07, 25). All subsequent registrations are created with `bracketPosition: null` until a later admin-authorized final draw.

## Local verification

```text
npm install
npm test
```

The test starts an in-process localhost server with a temporary database. It sends 100 concurrent registration requests, verifies that only 29 additional participants are confirmed on top of the 3 seeded participants, and confirms that no bracket positions are assigned to those registrations.
