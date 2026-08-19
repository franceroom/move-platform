const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const router = express.Router();
const { q } = require("../lib/db");
const mailer = require("../lib/mailer");

// Durée de validité d'un lien « mot de passe » (heures).
const RESET_HOURS = 48;

// ── Rôles internes (collaborateurs) ──
const STAFF_ROLES = ["gestionnaire", "menage"];
const STAFF_ROLE_LABELS = { gestionnaire: "Gestionnaire locatif", menage: "Agent ménage" };

function rolesOf(u) {
  return String((u && u.staff_roles) || "").split(",").map(s => s.trim()).filter(Boolean);
}
function hasRole(u, role) {
  return Boolean(u && (u.role === "admin" || rolesOf(u).includes(role)));
}
function staffHome(u) {
  if (!u) return "/connexion";
  if (u.role === "admin" || rolesOf(u).includes("gestionnaire")) return "/admin";
  if (rolesOf(u).includes("menage")) return "/admin/planning";
  return "/compte";
}
function sessionUser(user) {
  return { id: user.id, email: user.email, first_name: user.first_name, role: user.role, staff_roles: user.staff_roles || "" };
}

function safeNext(n) { return n && /^\/[a-z0-9\/-]*$/i.test(n) ? n : null; }

router.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(staffHome(req.session.user));
  res.render("pages/login", { title: res.locals.t("nav.login"), error: null, next: safeNext(req.query.next) || "" });
});

router.post("/connexion", async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const rows = await q("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password_hash))) {
      return res.status(401).render("pages/login", { title: res.locals.t("nav.login"), error: res.locals.t("login.error"), next: safeNext(req.body.next) || "" });
    }
    req.session.user = sessionUser(user);
    res.redirect(safeNext(req.body.next) || staffHome(req.session.user));
  } catch (e) { next(e); }
});

router.get("/inscription", (req, res) => {
  if (req.session.user) return res.redirect("/compte");
  res.render("pages/signup", { title: res.locals.t("nav.signup"), error: null, next: safeNext(req.query.next) || "", form: {} });
});

router.post("/inscription", async (req, res, next) => {
  try {
    const f = {
      email: (req.body.email || "").trim().toLowerCase(),
      first_name: (req.body.first_name || "").trim(),
      last_name: (req.body.last_name || "").trim(),
      phone: (req.body.phone || "").trim()
    };
    const pw = req.body.password || "";
    const bad = (msg) => res.status(400).render("pages/signup", { title: res.locals.t("nav.signup"), error: msg, next: safeNext(req.body.next) || "", form: f });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return bad(res.locals.t("signup.badEmail"));
    if (pw.length < 8) return bad(res.locals.t("signup.badPassword"));
    if (!f.first_name || !f.last_name) return bad(res.locals.t("signup.badName"));
    const exists = await q("SELECT 1 FROM users WHERE email = $1", [f.email]);
    if (exists.length) return bad(res.locals.t("signup.exists"));
    const hash = await bcrypt.hash(pw, 10);
    const rows = await q(
      "INSERT INTO users (email, password_hash, first_name, last_name, phone, role, locale) VALUES ($1,$2,$3,$4,$5,'tenant',$6) RETURNING id",
      [f.email, hash, f.first_name, f.last_name, f.phone, req.locale]);
    req.session.user = { id: rows[0].id, email: f.email, first_name: f.first_name, role: "tenant", staff_roles: "" };
    res.redirect(safeNext(req.body.next) || "/compte");
  } catch (e) { next(e); }
});

router.post("/deconnexion", (req, res) => { req.session = null; res.redirect("/"); });

// ── Mot de passe : oubli, lien de réinitialisation, changement ──
function baseUrl() { return process.env.PUBLIC_BASE_URL || "http://localhost:3001"; }

// Crée un lien à usage unique (48 h) permettant de définir un mot de passe.
async function createResetLink(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + RESET_HOURS * 3600 * 1000).toISOString();
  await q("INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1,$2,$3)", [token, userId, expires]);
  return `${baseUrl()}/nouveau-mot-de-passe/${token}`;
}

async function validReset(token) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
  const rows = await q("SELECT * FROM password_resets WHERE token = $1", [token]);
  const r = rows[0];
  if (!r || r.used_at) return null;
  if (new Date(r.expires_at) < new Date()) return null;
  return r;
}

async function setPassword(userId, pw) {
  const hash = await bcrypt.hash(pw, 10);
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
}

router.get("/mot-de-passe-oublie", (req, res) => {
  res.render("pages/forgot", { title: res.locals.t("forgot.title"), sent: false, error: null });
});

router.post("/mot-de-passe-oublie", async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const user = (await q("SELECT id, email, first_name FROM users WHERE email = $1", [email]))[0];
    if (user) {
      const link = await createResetLink(user.id);
      try {
        await mailer.send({
          to: user.email,
          subject: "Move — définir votre mot de passe",
          text: `Bonjour${user.first_name ? " " + user.first_name : ""},\n\n`
            + `Pour définir un nouveau mot de passe sur Move, ouvrez ce lien (valable ${RESET_HOURS} h, à usage unique) :\n${link}\n\n`
            + `Ensuite, vous vous connecterez toujours avec votre email et ce mot de passe.\n\nL'équipe Move — France Room`
        });
      } catch (e) { console.error("[reset] email non envoyé", e && e.message); }
    }
    // Réponse identique que le compte existe ou non (pas d'énumération d'emails).
    res.render("pages/forgot", { title: res.locals.t("forgot.title"), sent: true, error: null });
  } catch (e) { next(e); }
});

router.get("/nouveau-mot-de-passe/:token", async (req, res, next) => {
  try {
    const r = await validReset(req.params.token);
    if (!r) return res.status(404).render("pages/reset", { title: res.locals.t("reset.title"), token: null, error: null });
    res.render("pages/reset", { title: res.locals.t("reset.title"), token: req.params.token, error: null });
  } catch (e) { next(e); }
});

router.post("/nouveau-mot-de-passe/:token", async (req, res, next) => {
  try {
    const r = await validReset(req.params.token);
    if (!r) return res.status(404).render("pages/reset", { title: res.locals.t("reset.title"), token: null, error: null });
    const pw = req.body.password || "";
    const pw2 = req.body.password2 || "";
    const bad = (msg) => res.status(400).render("pages/reset", { title: res.locals.t("reset.title"), token: req.params.token, error: msg });
    if (pw.length < 8) return bad(res.locals.t("signup.badPassword"));
    if (pw !== pw2) return bad(res.locals.t("password.mismatch"));
    await setPassword(r.user_id, pw);
    await q("UPDATE password_resets SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL", [new Date().toISOString(), r.user_id]);
    const user = (await q("SELECT * FROM users WHERE id = $1", [r.user_id]))[0];
    req.session.user = sessionUser(user);
    res.redirect(staffHome(req.session.user));
  } catch (e) { next(e); }
});

router.get("/mon-mot-de-passe", requireUser, (req, res) => {
  res.render("pages/password", { title: res.locals.t("password.title"), error: null, done: false });
});

router.post("/mon-mot-de-passe", requireUser, async (req, res, next) => {
  try {
    const user = (await q("SELECT * FROM users WHERE id = $1", [req.session.user.id]))[0];
    if (!user) { req.session = null; return res.redirect("/connexion"); }
    const pw = req.body.password || "";
    const pw2 = req.body.password2 || "";
    const bad = (msg) => res.status(400).render("pages/password", { title: res.locals.t("password.title"), error: msg, done: false });
    // Compte créé via Google : pas de mot de passe utilisable, on n'en demande pas l'ancien.
    const hasPassword = /^\$2[aby]?\$/.test(String(user.password_hash || ""));
    if (hasPassword && !(await bcrypt.compare(req.body.current || "", user.password_hash))) {
      return bad(res.locals.t("password.wrongCurrent"));
    }
    if (pw.length < 8) return bad(res.locals.t("signup.badPassword"));
    if (pw !== pw2) return bad(res.locals.t("password.mismatch"));
    await setPassword(user.id, pw);
    res.render("pages/password", { title: res.locals.t("password.title"), error: null, done: true });
  } catch (e) { next(e); }
});

// ── Invitations collaborateurs (lien envoyé par l'admin) ──
async function validInvitation(token) {
  if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
  const rows = await q("SELECT * FROM staff_invitations WHERE token = $1", [token]);
  const inv = rows[0];
  if (!inv || inv.used_at) return null;
  if (new Date(inv.expires_at) < new Date()) return null;
  return inv;
}

router.get("/invitation/:token", async (req, res, next) => {
  try {
    const inv = await validInvitation(req.params.token);
    if (!inv) return res.status(404).render("pages/invitation", { title: "Invitation", inv: null, error: null, form: {}, roleLabels: STAFF_ROLE_LABELS });
    res.render("pages/invitation", { title: "Invitation", inv, error: null, form: { first_name: inv.first_name }, roleLabels: STAFF_ROLE_LABELS });
  } catch (e) { next(e); }
});

router.post("/invitation/:token", async (req, res, next) => {
  try {
    const inv = await validInvitation(req.params.token);
    if (!inv) return res.status(404).render("pages/invitation", { title: "Invitation", inv: null, error: null, form: {}, roleLabels: STAFF_ROLE_LABELS });
    const f = { first_name: (req.body.first_name || "").trim(), last_name: (req.body.last_name || "").trim() };
    const pw = req.body.password || "";
    const bad = (msg) => res.status(400).render("pages/invitation", { title: "Invitation", inv, error: msg, form: f, roleLabels: STAFF_ROLE_LABELS });
    if (!f.first_name || !f.last_name) return bad("Prénom et nom requis.");
    if (pw.length < 8) return bad("Mot de passe : 8 caractères minimum.");
    const email = inv.email.toLowerCase();
    const exists = await q("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.length) {
      // Le compte existait déjà : on ajoute les rôles ET on enregistre le mot de passe choisi,
      // puis on ouvre la session directement (sinon le collaborateur restait sans identifiants).
      await q("UPDATE users SET staff_roles = $1, first_name = $2, last_name = $3 WHERE id = $4",
        [inv.roles, f.first_name, f.last_name, exists[0].id]);
      await setPassword(exists[0].id, pw);
      await q("UPDATE staff_invitations SET used_at = now() WHERE id = $1", [inv.id]);
      const user = (await q("SELECT * FROM users WHERE id = $1", [exists[0].id]))[0];
      req.session.user = sessionUser(user);
      return res.redirect(staffHome(req.session.user));
    }
    const hash = await bcrypt.hash(pw, 10);
    const rows = await q(
      "INSERT INTO users (email, password_hash, first_name, last_name, role, staff_roles, locale) VALUES ($1,$2,$3,$4,'tenant',$5,'fr') RETURNING id",
      [email, hash, f.first_name, f.last_name, inv.roles]);
    await q("UPDATE staff_invitations SET used_at = now() WHERE id = $1", [inv.id]);
    req.session.user = { id: rows[0].id, email, first_name: f.first_name, role: "tenant", staff_roles: inv.roles };
    res.redirect(staffHome(req.session.user));
  } catch (e) { next(e); }
});

// ── Middlewares d'accès ──
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  return res.redirect("/connexion");
}

function requireUser(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/connexion?next=" + encodeURIComponent(req.originalUrl));
}

function requireRole(role) {
  return (req, res, next) => {
    if (hasRole(req.session.user, role)) return next();
    if (req.session.user) return res.status(403).send("Accès réservé — demandez le rôle nécessaire à l'administrateur.");
    return res.redirect("/connexion?next=" + encodeURIComponent(req.originalUrl));
  };
}

module.exports = { router, requireAdmin, requireUser, requireRole, hasRole, rolesOf, staffHome, sessionUser, createResetLink, RESET_HOURS, STAFF_ROLES, STAFF_ROLE_LABELS };
