import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "up_cache.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS levels (
    cache_key TEXT PRIMARY KEY,   -- e.g. "districts" or "tehsils:193" or "villages:193:00978"
    payload   TEXT NOT NULL,      -- JSON
    fetched_at INTEGER NOT NULL   -- unix epoch seconds
  );

  CREATE TABLE IF NOT EXISTS gis_codes (
    levels_csv TEXT PRIMARY KEY,  -- e.g. "193,00978,199245,"
    gis_code   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plots (
    gis_code TEXT NOT NULL,
    plot_no  TEXT NOT NULL,
    payload  TEXT NOT NULL,       -- the normalized plot record
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (gis_code, plot_no)
  );
`);

const TTL_SECONDS = parseInt(process.env.LEVEL_TTL_SECONDS || "604800", 10); // 7 days

function now() {
  return Math.floor(Date.now() / 1000);
}

export function getLevels(cacheKey) {
  const row = db
    .prepare("SELECT payload, fetched_at FROM levels WHERE cache_key = ?")
    .get(cacheKey);
  if (!row) return null;
  if (now() - row.fetched_at > TTL_SECONDS) return null;
  return JSON.parse(row.payload);
}

export function setLevels(cacheKey, payload) {
  db.prepare(
    `INSERT INTO levels (cache_key, payload, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload,
                                          fetched_at = excluded.fetched_at`
  ).run(cacheKey, JSON.stringify(payload), now());
}

export function getGisCode(levelsCsv) {
  const row = db
    .prepare("SELECT gis_code FROM gis_codes WHERE levels_csv = ?")
    .get(levelsCsv);
  return row ? row.gis_code : null;
}

export function setGisCode(levelsCsv, gisCode) {
  db.prepare(
    `INSERT INTO gis_codes (levels_csv, gis_code) VALUES (?, ?)
     ON CONFLICT(levels_csv) DO UPDATE SET gis_code = excluded.gis_code`
  ).run(levelsCsv, gisCode);
}

export function getPlot(gisCode, plotNo) {
  const row = db
    .prepare("SELECT payload FROM plots WHERE gis_code = ? AND plot_no = ?")
    .get(gisCode, plotNo);
  return row ? JSON.parse(row.payload) : null;
}

export function setPlot(gisCode, plotNo, payload) {
  db.prepare(
    `INSERT INTO plots (gis_code, plot_no, payload, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(gis_code, plot_no)
     DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
  ).run(gisCode, plotNo, JSON.stringify(payload), now());
}

export default db;
