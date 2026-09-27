# 21 eSports registration backend

This is a standalone Node/Express/SQLite service for **21 eSports Pokal – EA SPORTS FC Season 1**. It does not share source files, a database, a port, routes, configuration, or BTCPay code with the Bitcoin-Herbst ticket backend.

## Phase 3B scope

- Separate SQLite schema, migration (v2), and idempotent initial seed of the three fixed participants.
- Pending email registration + SHA-256-hashed confirmation token (single-use, 30-minute expiry).
- Inert mail adapter with SMTP/API provider placeholders (real delivery disabled by default).
- Atomic 32-capacity core with parallel registration tests.
- Public tournament API with explicit PII redaction (no email/Token/PubKey exposed).
- In-memory rate limiting for email endpoints.
- Phase 3A regression: all Phase 3A tests still pass.

## Event card on the main page

The main page (`index.html`) renders its event list from `programm.csv` via `script.js`. The 18 October row already exists there as confirmed base state:

```csv
2026-10-18,10:00,21 eSports Pokal – FC Season 1,"EA SPORTS FC Turnier · 18. Oktober 2026 · 10:00 Uhr.",eSports,Bitcoin Metropole,esports.html
```

`script.js` `renderEvents` adds the `.event-card--esports` highlight class, a trophy emblem, and an `.event-registration-link` ("JETZT ANMELDEN") that links to `esports.html`. `style.css` `.event-card--esports` already provides the Bitcoin-orange/blue glow. This base state is unchanged by Phase 3B.

## Local verification

```text
npm install
npm test
```

The test suite starts an in-process localhost server with a temporary database. It exercises the full email flow (start → confirm → participant mail callback), token security, capacity, rate limiting, public API PII redaction, and full Phase 3A regression.
