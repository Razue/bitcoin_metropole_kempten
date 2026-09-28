# 21 eSports registration backend

Standalone Node/Express/SQLite service for **21 eSports Pokal – FC Season 1**. It does not share source files, database, port, routes, configuration, or BTCPay code with the Bitcoin-Herbst ticket backend.

## Active FC Season 1 flow

- `Nickname + E-Mail → ANMELDEN → confirmed` happens atomically.
- The private email is visible only through authenticated admin endpoints; public APIs expose nicknames only.
- Capacity is 32 confirmed participants, including the three fixed existing participants. A 33rd participant is rejected.
- Registration does not allocate a bracket position. Draw preview and explicit draw lock remain separate admin actions.
- No automatic email is sent. Organizer contact: `bitcoinmetropole@proton.me`.

## Retained future-season confirmation mode

The pending-email, SHA-256 confirmation-token, and inert mail-adapter infrastructure remains in the codebase for a future season. It is **disabled by default** for FC Season 1. A future deployment must explicitly set `EMAIL_CONFIRMATION_ENABLED=true` before that separate mode can be used.

## Tournament core

- Multi-season/game schema with **21 eSports** as the series name; Season 1 is **FC Season 1**.
- Fixed positions: BitFit 04, FireOverFiat 07, MischaTurm 25.
- Persistent draw, match, bye, no-show/disqualification, progression, Top 4, and public Hall-of-Fame model.
- Server-side admin surface is protected by `ADMIN_SECRET`; it fails closed when absent.

## Event card on the main page

The main page (`index.html`) renders its event list from `programm.csv` via `script.js`. The 18 October row links to `esports.html`. This service does not change the ticket system or BTCPay integration.

## Local verification

```text
npm ci
npm test
```

The test suite uses temporary local databases and exercises Phase 3A, the retained Phase 3B confirmation mode, Phase 3C tournament logic, and the active Phase 3D direct FC Season 1 registration flow.
