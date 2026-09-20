import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "@/lib/domain/types";
import { buildSeed } from "./seed";

// Local, Supabase-shaped persistence. Everything the app reads or writes goes
// through this module, so Phase 1's real migration only has to replace the
// bodies of the RPC functions in src/lib/db/rpc.ts.
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "pwfts.json");

// Cached across hot reloads in dev.
const globalCache = globalThis as unknown as { __pwfts_db?: Database };

function load(): Database {
  if (globalCache.__pwfts_db) return globalCache.__pwfts_db;
  let db: Database;
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Database;
  } catch {
    db = buildSeed();
    persist(db);
  }
  globalCache.__pwfts_db = db;
  return db;
}

function persist(db: Database) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch {
    // Read-only filesystem (e.g. a serverless host): keep the in-memory copy.
  }
}

export function getDb(): Database {
  return load();
}

/** Mutate the database and persist atomically. */
export function writeDb<T>(fn: (db: Database) => T): T {
  const db = load();
  const result = fn(db);
  persist(db);
  return result;
}

export function resetDb(): void {
  const db = buildSeed();
  globalCache.__pwfts_db = db;
  persist(db);
}

/**
 * now_app() — real time plus the demo clock offset. Use this everywhere
 * instead of new Date(), so the Admin demo clock moves the whole system.
 */
export function nowApp(): Date {
  const db = load();
  return new Date(Date.now() + db.system_clock.offset_minutes * 60_000);
}

export function setClockOffset(minutes: number): void {
  writeDb((db) => {
    db.system_clock.offset_minutes = minutes;
  });
}

export function shiftClock(days: number): void {
  writeDb((db) => {
    db.system_clock.offset_minutes += days * 24 * 60;
  });
}

export function nextSeq(key: string): number {
  return writeDb((db) => {
    db.seq_counters[key] = (db.seq_counters[key] ?? 0) + 1;
    return db.seq_counters[key];
  });
}

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return prefix + "-" + Date.now().toString(36) + "-" + idCounter.toString(36);
}
