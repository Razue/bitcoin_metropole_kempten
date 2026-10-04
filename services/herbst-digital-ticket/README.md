# Bitcoin Herbst 2026 â€” local digital ticket preview

Local preview only. Not deployed.

This service does not call `POST /api/tickets/create` and does not call `POST https://tickets.lernbitcoin.com/api/tickets/create`. It does not change checkout, reservations, webhooks, or inventory. It does not connect to BTCPay, production webhooks, or the production payment database.

Checkout on the public site stays as it is: the browser posts `{name, email, quantity}` and redirects to `payUrl`. This folder is an additive local layer only. Do not merge it into `script.js`.

## Artwork

Decorative files already live at the repository root. This service does not copy them.

| Role | Path from repository root | Path from this directory |
| --- | --- | --- |
| Logo | `images/goldenLogoHerbst.png` | `../../images/goldenLogoHerbst.png` |
| Leaf watermark | `images/bitcoin-herbst-leaf-transparent.png` | `../../images/bitcoin-herbst-leaf-transparent.png` |
| Small gold mark | `images/gold_transparent.png` | `../../images/gold_transparent.png` |

Preview HTML references the site-root paths (`/images/goldenLogoHerbst.png`, `/images/bitcoin-herbst-leaf-transparent.png`, `/images/gold_transparent.png`). `src/server.js` reads those three files from `../../../images` at runtime. Hermes should keep using the same repository paths. Do not commit duplicate image bytes under this service.

This ticket task is not mx12Art. Do not mix it with artwork-wallet branding.

## Commands

```bash
cd services/herbst-digital-ticket
npm install
npm test
npm start
```

`npm test` runs `node --test test/tickets.test.js`.

`npm start` listens only on `http://127.0.0.1:8787`. No environment variables are read. The bind address and port are fixed in `src/server.js`. If something else is already bound to 8787, do not kill it to free the port unless you know it is this preview.

The only SQLite file is `data/tickets.db` inside this service. It is gitignored. The only purchase id the process assigns on startup is the labeled local fixture `local-fixture-settled-001`. That fixture is not a buyer, an invoice, or a payment. The eight tickets already sold in production are not invented here.

QR codes encode only `http://127.0.0.1:<port>/verify/<opaque-token>`. An unknown token renders UNGÃœLTIG and no ticket number.

`data/tickets.db`, `data/local-preview.json`, `node_modules/`, and `.env` must stay private and must not be pushed.
