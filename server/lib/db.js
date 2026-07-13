// Couche base de données.
// Prod / Render : PostgreSQL via DATABASE_URL.
// Dev sandbox   : DEV_FAKE_DB=1 → pg-mem (émulateur en mémoire) + schéma + seed.
const fs = require("fs");
const path = require("path");

let pool;

if (process.env.DEV_FAKE_DB === "1") {
  const { newDb } = require("pg-mem");
  const mem = newDb();
  const schema = fs.readFileSync(path.join(__dirname, "..", "..", "db", "schema.sql"), "utf8");
  mem.public.none(schema);
  const seedPath = path.join(__dirname, "..", "..", "db", "seed-dev.sql");
  if (fs.existsSync(seedPath)) mem.public.none(fs.readFileSync(seedPath, "utf8"));
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  console.log("[db] pg-mem (DEV_FAKE_DB=1) — schéma + seed chargés");
} else {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || "").includes("render.com") ? { rejectUnauthorized: false } : false
  });
}

async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

module.exports = { q, pool };
