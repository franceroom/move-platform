// Applique db/schema.sql sur la base DATABASE_URL (idempotent : CREATE IF NOT EXISTS).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL manquante (.env)");
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.query(sql);
  console.log("Migration OK");
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
