import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { assignTickets, LOCAL_FIXTURE } from "./assign.js";
import { openDatabase, PREVIEW_DB_PATH } from "./db.js";
import { renderHome, renderTicketPage, renderVerifyPage, verificationUrl } from "./html.js";

// This process never calls POST https://tickets.lernbitcoin.com/api/tickets/create.
// It does not connect to BTCPay, webhooks, or any production database.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Existing repo artwork. From this file: ../../../images/<name>
// which is images/ at the repository root. Bytes are not copied into this service.
const REPO_IMAGES = path.resolve(__dirname, "../../../images");
const ASSETS = {
  "/images/goldenLogoHerbst.png": path.join(REPO_IMAGES, "goldenLogoHerbst.png"),
  "/images/bitcoin-herbst-leaf-transparent.png": path.join(REPO_IMAGES, "bitcoin-herbst-leaf-transparent.png"),
  "/images/gold_transparent.png": path.join(REPO_IMAGES, "gold_transparent.png"),
};

const findByToken = (db, token) => {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  return db.prepare(
    `SELECT ticket_number, token, status
     FROM tickets
     WHERE token = ? AND status = 'valid'`
  ).get(token) || null;
};

async function qrDataUrl(payload) {
  const buf = await QRCode.toBuffer(payload, {
    type: "png",
    width: 360,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#ffffff" },
  });
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(html);
}

async function handle(req, res, db, server) {
  if (req.method !== "GET") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET" });
    res.end("GET only");
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch {
    sendHtml(res, 200, renderVerifyPage({ valid: false }));
    return;
  }

  if (ASSETS[pathname]) {
    const buf = await fs.promises.readFile(ASSETS[pathname]);
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    });
    res.end(buf);
    return;
  }

  if (pathname === "/") {
    const port = server.address().port;
    const rows = db.prepare(
      `SELECT token FROM tickets WHERE purchase_id = ? ORDER BY ticket_number ASC`
    ).all(LOCAL_FIXTURE.id);
    const links = rows.map((row) => `http://127.0.0.1:${port}/ticket/${row.token}`);
    sendHtml(res, 200, renderHome(links));
    return;
  }

  const ticketMatch = pathname.match(/^\/ticket\/([^/]+)$/);
  const verifyMatch = pathname.match(/^\/verify\/([^/]+)$/);
  if (!ticketMatch && !verifyMatch) {
    sendHtml(res, 200, renderVerifyPage({ valid: false }));
    return;
  }

  const token = (ticketMatch || verifyMatch)[1];
  const row = findByToken(db, token);
  if (!row) {
    sendHtml(res, 200, renderVerifyPage({ valid: false }));
    return;
  }

  if (verifyMatch) {
    sendHtml(res, 200, renderVerifyPage({ valid: true, number: row.ticket_number }));
    return;
  }

  const port = server.address().port;
  const payload = verificationUrl(port, row.token);
  const qr = await qrDataUrl(payload);
  sendHtml(res, 200, renderTicketPage({ number: row.ticket_number, qrDataUrl: qr }));
}

export function createPreviewServer({ db }) {
  const server = http.createServer((req, res) => {
    handle(req, res, db, server).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end("preview error");
    });
  });
  return server;
}

function start() {
  const db = openDatabase(PREVIEW_DB_PATH);
  const assigned = assignTickets(db, LOCAL_FIXTURE);
  const ticket = assigned.tickets[0];
  if (!ticket) {
    console.error("local fixture was not assigned");
    process.exit(1);
  }
  const server = createPreviewServer({ db });
  server.listen(8787, "127.0.0.1", () => {
    const port = server.address().port;
    const info = {
      note: "Synthetic local fixture only. Not a buyer, invoice, or payment.",
      purchaseId: LOCAL_FIXTURE.id,
      number: ticket.number,
      ticketUrl: `http://127.0.0.1:${port}/ticket/${ticket.token}`,
      verifyUrl: verificationUrl(port, ticket.token),
      invalidUrl: `http://127.0.0.1:${port}/verify/${"0".repeat(64)}`,
    };
    fs.writeFileSync(
      path.join(path.dirname(PREVIEW_DB_PATH), "local-preview.json"),
      `${JSON.stringify(info, null, 2)}\n`
    );
    console.log(JSON.stringify(info));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) start();
