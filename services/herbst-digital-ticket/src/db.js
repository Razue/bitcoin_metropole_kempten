import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// Public aggregate recorded from one GET
// https://tickets.lernbitcoin.com/api/tickets/available
// on 2026-10-04 (Europe/Berlin). Informational only.
// This preview does not invent buyer rows from the sold count.
// {"total":50,"sold":8,"reserved":0,"available":42,"ticketPriceSats":"100000","event":"Bitcoin Herbst 2026","date":"2026-11-20/21"}
//
// The application database is this local file only. It is not the production DB.
// Local to this service only. Never the production payment database.
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PREVIEW_DB_PATH = path.join(serviceRoot, "data", "tickets.db");

export const MAX_TICKETS = 50;

export function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  // status is only "valid" for now so a later CHECKED IN state can be added.
  // There is no check-in flow in this preview.
  // Columns are purchase id, ticket number, token, and status. Nothing else.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_number INTEGER PRIMARY KEY CHECK (ticket_number BETWEEN 1 AND ${MAX_TICKETS}),
      purchase_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status = 'valid')
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_purchase_id ON tickets (purchase_id);
  `);
  return db;
}
