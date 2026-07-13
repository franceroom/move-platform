// Connexion Google (OAuth 2.0 / OpenID Connect) — zéro dépendance.
// Nécessite GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (créés par France Room dans Google Cloud Console).
// Rattachement par email vérifié : si l'email existe (ex. admin), connexion sur ce compte ; sinon création locataire.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { q } = require("../lib/db");

const enabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const baseUrl = () => process.env.PUBLIC_BASE_URL || "http://localhost:3001";
const redirectUri = () => `${baseUrl()}/auth/google/callback`;

router.get("/auth/google", (req, res) => {
  if (!enabled()) return res.status(404).render("pages/404");
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  if (req.query.next && /^\/[a-z0-9\/-]*$/i.test(req.query.next)) req.session.oauthNext = req.query.next;
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
});

router.get("/auth/google/callback", async (req, res, next) => {
  try {
    if (!enabled()) return res.status(404).render("pages/404");
    if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
      return res.status(400).send("Échec de la connexion Google (état invalide). Réessayez depuis la page de connexion.");
    }
    req.session.oauthState = null;

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code"
      }),
      signal: AbortSignal.timeout(15000)
    });
    const tokens = await tokenResp.json();
    if (!tokenResp.ok || !tokens.access_token) throw new Error("Échange de code Google refusé");

    const uiResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000)
    });
    const info = await uiResp.json();
    if (!uiResp.ok || !info.email || info.email_verified !== true) {
      return res.status(400).send("Compte Google sans email vérifié — connexion refusée.");
    }

    const email = info.email.toLowerCase();
    let rows = await q("SELECT * FROM users WHERE email = $1", [email]);
    let user = rows[0];
    if (!user) {
      const randomHash = "google-oauth:" + crypto.randomBytes(32).toString("hex"); // jamais un mot de passe valide pour bcrypt.compare
      const ins = await q(
        "INSERT INTO users (email, password_hash, first_name, last_name, role, locale) VALUES ($1,$2,$3,$4,'tenant',$5) RETURNING *",
        [email, randomHash, info.given_name || "", info.family_name || "", req.locale || "fr"]);
      user = ins[0];
    }
    req.session.user = { id: user.id, email: user.email, first_name: user.first_name, role: user.role };
    const nxt = req.session.oauthNext; req.session.oauthNext = null;
    res.redirect(nxt || (user.role === "admin" ? "/admin" : "/compte"));
  } catch (e) { next(e); }
});

module.exports = { router, enabled };
