// Applique db/schema.sql (idempotent) puis crée l'admin si ADMIN_EMAIL/ADMIN_PASSWORD sont posés
// et qu'aucun utilisateur n'existe. Lancé automatiquement au démarrage (npm start).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");

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
  console.log("[migrate] schéma OK");

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM users");
    if (rows[0].n === 0) {
      const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
      await client.query(
        "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,$2,'Admin','France Room','admin')",
        [process.env.ADMIN_EMAIL.toLowerCase(), hash]);
      console.log("[migrate] admin créé :", process.env.ADMIN_EMAIL);
    } else {
      console.log("[migrate] utilisateurs existants — pas de création admin");
    }
  }
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
