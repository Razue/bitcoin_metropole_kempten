import { randomBytes } from "node:crypto";
import { MAX_TICKETS } from "./db.js";

// Synthetic local fixture. Not a buyer, an email, an invoice, or a payment.
export const LOCAL_FIXTURE = Object.freeze({
  id: "local-fixture-settled-001",
  status: "Settled",
  quantity: 1,
});

function none() {
  return { tickets: [], created: false, refused: false };
}

function mapRow(row) {
  return {
    number: row.ticket_number,
    token: row.token,
    status: row.status,
  };
}

/**
 * Assign stable ticket identities for one purchase.
 * Only status "Settled" creates tickets. Repeat calls with the same purchase
 * id return the same numbers and tokens and never allocate new numbers.
 * Numbers are 1..50. If this purchase would pass 50, nothing is written.
 * Buyer name, email, invoice payload, and payment secrets are ignored.
 */
export function assignTickets(db, purchase) {
  if (!purchase || typeof purchase.id !== "string") return none();
  const purchaseId = purchase.id;
  if (purchaseId.length === 0 || purchaseId.length > 200 || purchaseId.includes("\0")) {
    return none();
  }

  const selectExisting = db.prepare(
    `SELECT ticket_number, token, status
     FROM tickets
     WHERE purchase_id = ?
     ORDER BY ticket_number ASC`
  );
  const countAll = db.prepare("SELECT COUNT(*) AS c FROM tickets");
  const maxNum = db.prepare("SELECT COALESCE(MAX(ticket_number), 0) AS m FROM tickets");
  const insert = db.prepare(
    `INSERT INTO tickets (ticket_number, purchase_id, token, status)
     VALUES (?, ?, ?, 'valid')`
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = selectExisting.all(purchaseId).map(mapRow);
    if (existing.length > 0) {
      db.exec("COMMIT");
      return { tickets: existing, created: false, refused: false };
    }

    if (purchase.status !== "Settled") {
      db.exec("COMMIT");
      return none();
    }

    const qty = purchase.quantity;
    if (!Number.isInteger(qty) || qty < 1) {
      db.exec("COMMIT");
      return none();
    }

    const count = Number(countAll.get().c);
    if (count + qty > MAX_TICKETS) {
      db.exec("COMMIT");
      return { tickets: [], created: false, refused: true, reason: "capacity" };
    }

    const start = Number(maxNum.get().m);
    const tickets = [];
    for (let i = 1; i <= qty; i += 1) {
      const number = start + i;
      if (number > MAX_TICKETS) {
        throw Object.assign(new Error("capacity"), { code: "CAPACITY" });
      }
      const token = randomBytes(32).toString("hex");
      insert.run(number, purchaseId, token);
      tickets.push({ number, token, status: "valid" });
    }

    db.exec("COMMIT");
    return { tickets, created: true, refused: false };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* transaction already closed */
    }
    if (err && err.code === "CAPACITY") {
      return { tickets: [], created: false, refused: true, reason: "capacity" };
    }
    throw err;
  }
}
