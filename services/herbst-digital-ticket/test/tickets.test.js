import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { assignTickets } from "../src/assign.js";
import { openDatabase } from "../src/db.js";
import { verificationUrl } from "../src/html.js";
import { createPreviewServer } from "../src/server.js";

function fresh() {
  return openDatabase(":memory:");
}

function disclosesTicketNumber(html, number) {
  if (html.includes(`data-ticket-number="${number}"`)) return true;
  if (new RegExp(`>\\s*${number}\\s*<`).test(html)) return true;
  return false;
}

function decodeQr(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const png = PNG.sync.read(Buffer.from(b64, "base64"));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(code, "QR code did not decode");
  return code.data;
}

describe("assignTickets", () => {
  it("settled fixture creates one valid ticket", () => {
    const db = fresh();
    const result = assignTickets(db, {
      id: "local-fixture-settled-001",
      status: "Settled",
      quantity: 1,
    });
    assert.equal(result.created, true);
    assert.equal(result.refused, false);
    assert.equal(result.tickets.length, 1);
    const ticket = result.tickets[0];
    assert.equal(ticket.number, 1);
    assert.equal(ticket.status, "valid");
    assert.match(ticket.token, /^[0-9a-f]{64}$/);
    const row = db.prepare("SELECT purchase_id, ticket_number, token, status FROM tickets").get();
    assert.deepEqual(row, {
      purchase_id: "local-fixture-settled-001",
      ticket_number: 1,
      token: ticket.token,
      status: "valid",
    });
    const columns = db.prepare("PRAGMA table_info(tickets)").all().map((col) => col.name).sort();
    assert.deepEqual(columns, ["purchase_id", "status", "ticket_number", "token"]);
    db.close();
  });

  it("second call with the same purchase id returns the same number and token", () => {
    const db = fresh();
    const first = assignTickets(db, { id: "local-purchase-a", status: "Settled", quantity: 1 });
    const second = assignTickets(db, { id: "local-purchase-a", status: "Settled", quantity: 1 });
    const again = assignTickets(db, { id: "local-purchase-a", status: "Settled", quantity: 5 });
    assert.equal(second.tickets.length, 1);
    assert.equal(again.tickets.length, 1);
    assert.equal(second.tickets[0].number, first.tickets[0].number);
    assert.equal(second.tickets[0].token, first.tickets[0].token);
    assert.equal(again.tickets[0].token, first.tickets[0].token);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 1);
    db.close();
  });

  it("a second settled purchase gets the next number", () => {
    const db = fresh();
    const first = assignTickets(db, { id: "local-purchase-a", status: "Settled", quantity: 1 });
    const second = assignTickets(db, { id: "local-purchase-b", status: "Settled", quantity: 1 });
    assert.equal(second.created, true);
    assert.equal(second.tickets[0].number, first.tickets[0].number + 1);
    assert.notEqual(second.tickets[0].token, first.tickets[0].token);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 2);
    db.close();
  });

  it("one settled purchase with quantity 2 creates two stable identities", () => {
    const db = fresh();
    const created = assignTickets(db, { id: "local-pair", status: "Settled", quantity: 2 });
    const again = assignTickets(db, { id: "local-pair", status: "Settled", quantity: 2 });
    assert.deepEqual(created.tickets.map((t) => t.number), [1, 2]);
    assert.deepEqual(again.tickets.map((t) => t.token), created.tickets.map((t) => t.token));
    db.close();
  });

  it("New, Processing, Expired, and Invalid create no ticket", () => {
    const db = fresh();
    for (const status of ["New", "Processing", "Expired", "Invalid", "settled", "SETTLED"]) {
      const result = assignTickets(db, { id: `local-${status}`, status, quantity: 1 });
      assert.deepEqual(result.tickets, [], status);
      assert.equal(result.created, false, status);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 0);
    db.close();
  });

  it("does not store buyer name, email, or invoice payload", () => {
    const db = fresh();
    assignTickets(db, {
      id: "local-no-pii",
      status: "Settled",
      quantity: 1,
      name: "Local Fixture",
      email: "fixture@example.invalid",
      invoice: { id: "not-stored" },
    });
    const dumped = JSON.stringify(db.prepare("SELECT * FROM tickets").all());
    assert.equal(dumped.includes("fixture@example.invalid"), false);
    assert.equal(dumped.includes("Local Fixture"), false);
    assert.equal(dumped.includes("not-stored"), false);
    db.close();
  });

  it("does not number past 50 and writes nothing for an overflow purchase", () => {
    const db = fresh();
    const full = assignTickets(db, { id: "local-full", status: "Settled", quantity: 50 });
    assert.equal(full.tickets.length, 50);
    assert.equal(full.tickets[0].number, 1);
    assert.equal(full.tickets[49].number, 50);
    const overflow = assignTickets(db, { id: "local-overflow", status: "Settled", quantity: 1 });
    assert.equal(overflow.refused, true);
    assert.deepEqual(overflow.tickets, []);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 50);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM tickets WHERE purchase_id = ?").get("local-overflow").c,
      0
    );
    const tooMany = fresh();
    const refused = assignTickets(tooMany, { id: "local-too-many", status: "Settled", quantity: 51 });
    assert.equal(refused.refused, true);
    assert.equal(tooMany.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 0);

    const boundary = fresh();
    assignTickets(boundary, { id: "local-almost", status: "Settled", quantity: 49 });
    const cross = assignTickets(boundary, { id: "local-cross", status: "Settled", quantity: 2 });
    assert.equal(cross.refused, true);
    assert.deepEqual(cross.tickets, []);
    assert.equal(
      boundary.prepare("SELECT COUNT(*) AS c FROM tickets WHERE purchase_id = ?").get("local-cross").c,
      0
    );
    assert.equal(boundary.prepare("SELECT COUNT(*) AS c FROM tickets").get().c, 49);
    const last = assignTickets(boundary, { id: "local-last", status: "Settled", quantity: 1 });
    assert.equal(last.tickets[0].number, 50);
    db.close();
    tooMany.close();
    boundary.close();
  });
});

describe("http preview", () => {
  let db;
  let server;
  let port;
  let base;

  before(async () => {
    db = fresh();
    server = createPreviewServer({ db });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  });

  it("serves a valid ticket and an invalid token without disclosing numbers", async () => {
    const settled = assignTickets(db, {
      id: "local-http-settled",
      status: "Settled",
      quantity: 1,
    });
    const ticket = settled.tickets[0];
    const ticketRes = await fetch(`${base}/ticket/${ticket.token}`);
    const ticketHtml = await ticketRes.text();
    assert.equal(ticketRes.status, 200);
    assert.match(ticketHtml, />\s*TICKET\s*</);
    assert.match(ticketHtml, /VON 50/);
    assert.match(ticketHtml, /PAID \/ VALID/);
    assert.equal(disclosesTicketNumber(ticketHtml, ticket.number), true);

    const validRes = await fetch(`${base}/verify/${ticket.token}`);
    const validHtml = await validRes.text();
    assert.match(validHtml, /BITCOIN HERBST 2026/);
    assert.match(validHtml, /(?<!UN)GÃœLTIG/);
    assert.match(validHtml, /20\.â€“21\. November 2026/);
    assert.match(validHtml, /Bitcoin Metropole Kempten/);
    assert.equal(disclosesTicketNumber(validHtml, ticket.number), true);

    const randomToken = "ab".repeat(32);
    assert.notEqual(randomToken, ticket.token);
    const invalidRes = await fetch(`${base}/verify/${randomToken}`);
    const invalidHtml = await invalidRes.text();
    assert.equal(invalidRes.status, 200);
    assert.match(invalidHtml, /BITCOIN HERBST 2026/);
    assert.match(invalidHtml, /UNGÃœLTIG/);
    assert.doesNotMatch(invalidHtml, /(?<!UN)GÃœLTIG/);
    assert.match(invalidHtml, /20\.â€“21\. November 2026/);
    assert.match(invalidHtml, /Bitcoin Metropole Kempten/);
    const issued = db.prepare("SELECT ticket_number, token FROM tickets").all();
    for (const row of issued) {
      assert.equal(disclosesTicketNumber(invalidHtml, row.ticket_number), false);
      assert.equal(invalidHtml.includes(row.token), false);
    }
    assert.equal(invalidHtml.includes(randomToken), false);

    const qrMatch = ticketHtml.match(/src="(data:image\/png;base64,[^"]+)"/);
    assert.ok(qrMatch, "ticket page missing QR image");
    const payload = decodeQr(qrMatch[1]);
    assert.equal(payload, verificationUrl(port, ticket.token));
    assert.equal(payload, `${base}/verify/${ticket.token}`);
  });
});
