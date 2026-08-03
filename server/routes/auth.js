const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const router = express.Router();
const { q } = require("../lib/db");

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
      await q("UPDATE users SET staff_roles = $1 WHERE id = $2", [inv.roles, exists[0].id]);
      await q("UPDATE staff_invitations SET used_at = now() WHERE id = $1", [inv.id]);
      return res.redirect("/connexion?next=" + encodeURIComponent("/admin"));
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

module.exports = { router, requireAdmin, requireUser, requireRole, hasRole, rolesOf, staffHome, sessionUser, STAFF_ROLES, STAFF_ROLE_LABELS };
