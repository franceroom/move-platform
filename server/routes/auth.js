const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const { q } = require("../lib/db");

function safeNext(n) { return n && /^\/[a-z0-9\/-]*$/i.test(n) ? n : null; }

router.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === "admin" ? "/admin" : "/compte");
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
    req.session.user = { id: user.id, email: user.email, first_name: user.first_name, role: user.role };
    res.redirect(safeNext(req.body.next) || (user.role === "admin" ? "/admin" : "/compte"));
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
    req.session.user = { id: rows[0].id, email: f.email, first_name: f.first_name, role: "tenant" };
    res.redirect(safeNext(req.body.next) || "/compte");
  } catch (e) { next(e); }
});

router.post("/deconnexion", (req, res) => { req.session = null; res.redirect("/"); });

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === "admin") return next();
  return res.redirect("/connexion");
}

function requireUser(req, res, next) {
  if (req.session.user) return next();
  return res.redirect("/connexion?next=" + encodeURIComponent(req.originalUrl));
}

module.exports = { router, requireAdmin, requireUser };
