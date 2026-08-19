// Administration France Room — interface interne en français.
// Accès par rôles : admin (tout), gestionnaire (annonces + demandes), menage (planning).
const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 20 } });
const router = express.Router();
const L = require("../lib/listings");
const { requireAdmin, requireRole, hasRole, createResetLink, RESET_HOURS, STAFF_ROLES, STAFF_ROLE_LABELS } = require("./auth");
const translate = require("../lib/translate");
const cal = require("../lib/calendar");
const { isoDate } = require("../lib/calendar");
const { q } = require("../lib/db");
const mailer = require("../lib/mailer");

const G = requireRole("gestionnaire");
const M = requireRole("menage");

router.get("/", (req, res, next) => {
  const u = req.session.user;
  if (!u) return res.redirect("/connexion?next=%2Fadmin");
  if (u.role !== "admin" && !hasRole(u, "gestionnaire")) {
    return hasRole(u, "menage") ? res.redirect("/admin/planning") : res.status(403).send("Accès réservé");
  }
  (async () => {
    res.render("pages/admin/list", { title: "Admin", rows: await L.allForAdmin(), euros: L.euros });
  })().catch(next);
});

router.get("/annonces/new", G, (req, res) => {
  res.render("pages/admin/form", { title: "Nouvelle annonce", l: null, photosText: "", icalText: "", blocks: [], translateEnabled: translate.enabled() });
});

router.post("/annonces/new", G, upload.array("photos"), async (req, res, next) => {
  try {
    const id = await L.create(req.body);
    await L.applyPhotos(id, { files: req.files || [] });
    res.redirect(`/admin/annonces/${id}/edit?ok=1`);
  } catch (e) { next(e); }
});

router.get("/annonces/:id/edit", G, async (req, res, next) => {
  try {
    const l = await L.byId(req.params.id);
    if (!l) return res.status(404).render("pages/404");
    const photosText = (l.photos || []).map(p => p.url).join("\n");
    let icalUrls = l.ical_import_urls;
    if (typeof icalUrls === "string") { try { icalUrls = JSON.parse(icalUrls); } catch { icalUrls = []; } }
    const icalText = (icalUrls || []).join("\n");
    const blocks = await cal.blocksOf(l.id);
    res.render("pages/admin/form", { title: `Annonce #${l.id}`, l, photosText, icalText, blocks, translateEnabled: translate.enabled() });
  } catch (e) { next(e); }
});

router.post("/annonces/:id/edit", G, upload.array("photos"), async (req, res, next) => {
  try {
    await L.update(req.params.id, req.body);
    const del = [].concat(req.body.delete_photo || []).map(Number).filter(Boolean);
    await L.applyPhotos(req.params.id, { deleteIds: del, files: req.files || [] });
    res.redirect(`/admin/annonces/${req.params.id}/edit?ok=1`);
  } catch (e) { next(e); }
});

router.post("/annonces/:id/status", G, async (req, res, next) => {
  try {
    await L.setStatus(req.params.id, req.body.status);
    res.redirect("/admin");
  } catch (e) { next(e); }
});

router.post("/annonces/:id/blocks", G, async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    if (start_date && end_date && end_date > start_date) {
      await cal.addBlock(req.params.id, start_date, end_date, "manual", "admin");
    }
    res.redirect(`/admin/annonces/${req.params.id}/edit`);
  } catch (e) { next(e); }
});

router.post("/annonces/:id/blocks/:blockId/delete", G, async (req, res, next) => {
  try {
    await cal.removeBlock(req.params.blockId, req.params.id);
    res.redirect(`/admin/annonces/${req.params.id}/edit`);
  } catch (e) { next(e); }
});

router.get("/demandes", G, async (req, res, next) => {
  try {
    const reqs = await q(
      `SELECT r.*, l.title_fr, l.slug, u.email AS tenant_email, u.first_name, u.last_name, u.phone
       FROM booking_requests r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.tenant_id
       ORDER BY r.created_at DESC`);
    res.render("pages/admin/requests", { title: "Demandes", reqs, euros: L.euros });
  } catch (e) { next(e); }
});

router.post("/demandes/:id/decision", G, async (req, res, next) => {
  try {
    const rows = await q("SELECT r.*, l.title_fr FROM booking_requests r JOIN listings l ON l.id = r.listing_id WHERE r.id = $1", [req.params.id]);
    const r = rows[0];
    if (!r || r.status !== "pending") return res.redirect("/admin/demandes");
    const decision = req.body.decision === "accept" ? "accepted" : "declined";
    if (decision === "accepted") {
      const free = await cal.isRangeFree(r.listing_id, isoDate(r.start_date), isoDate(r.end_date));
      if (!free) { await q("UPDATE booking_requests SET status = 'declined', updated_at = now() WHERE id = $1", [r.id]); return res.redirect("/admin/demandes?conflit=1"); }
    }
    await q("UPDATE booking_requests SET status = $1, updated_at = now() WHERE id = $2", [decision, r.id]);
    const t = await q("SELECT u.email FROM users u WHERE u.id = $1", [r.tenant_id]);
    if (t[0]) {
      const base = process.env.PUBLIC_BASE_URL || "http://localhost:3001";
      await mailer.send({ to: t[0].email,
        subject: decision === "accepted" ? "Move — votre demande est acceptée" : "Move — votre demande n'a pas pu être retenue",
        text: decision === "accepted"
          ? `Bonne nouvelle : votre demande pour « ${r.title_fr} » est acceptée.\nRéglez le premier mois pour confirmer : ${base}/compte`
          : `Votre demande pour « ${r.title_fr} » n'a pas pu être retenue. Notre équipe reste à votre écoute pour vous proposer une alternative.` });
    }
    res.redirect("/admin/demandes");
  } catch (e) { next(e); }
});

router.get("/proprietaires", requireAdmin, async (req, res, next) => {
  try {
    const leads = await q("SELECT * FROM owner_leads ORDER BY created_at DESC");
    res.render("pages/admin/leads", { title: "Candidatures propriétaires", leads });
  } catch (e) { next(e); }
});

router.post("/traduire", G, express.json(), async (req, res) => {
  if (!translate.enabled()) return res.status(503).json({ error: "Traduction non configurée (DEEPL_API_KEY)" });
  try {
    const title = await translate.toEnglish(req.body.title_fr || "");
    const description = await translate.toEnglish(req.body.description_fr || "");
    res.json({ title_en: title, description_en: description });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Planning ménage : arrivées / départs (lecture seule, sans prix ni données locataires) ──
router.get("/planning", M, async (req, res, next) => {
  try {
    const now = Date.now();
    const from = new Date(now - 7 * 864e5).toISOString().slice(0, 10);
    const to = new Date(now + 60 * 864e5).toISOString().slice(0, 10);
    const blocks = await q(
      `SELECT b.start_date, b.end_date, b.source, l.title_fr, l.ville, l.quartier, l.adresse
       FROM calendar_blocks b JOIN listings l ON l.id = b.listing_id
       WHERE b.source IN ('booking','ical') AND b.end_date >= $1 AND b.start_date <= $2
       ORDER BY b.start_date`, [from, to]);
    const arrivals = [], departures = [];
    for (const b of blocks) {
      const s = isoDate(b.start_date), e = isoDate(b.end_date);
      const item = { title: b.title_fr, ville: b.ville, quartier: b.quartier, adresse: b.adresse, source: b.source };
      if (s >= from && s <= to) arrivals.push(Object.assign({ date: s }, item));
      if (e >= from && e <= to) departures.push(Object.assign({ date: e }, item));
    }
    arrivals.sort((a, b) => a.date.localeCompare(b.date));
    departures.sort((a, b) => a.date.localeCompare(b.date));
    res.render("pages/admin/planning", { title: "Planning ménage", arrivals, departures, today: new Date(now).toISOString().slice(0, 10) });
  } catch (e) { next(e); }
});

// ── Gestion des collaborateurs (admin uniquement) ──
function rolesFromBody(body) {
  return [].concat(body.roles || []).filter(r => STAFF_ROLES.includes(r)).join(",");
}

router.get("/utilisateurs", requireAdmin, async (req, res, next) => {
  try {
    const staff = await q("SELECT id, email, first_name, last_name, role, staff_roles FROM users WHERE role = 'admin' OR staff_roles <> '' ORDER BY id");
    const invitations = await q("SELECT * FROM staff_invitations WHERE used_at IS NULL ORDER BY created_at DESC");
    res.render("pages/admin/users", { title: "Utilisateurs", staff, invitations, isoDate,
      roles: STAFF_ROLES, roleLabels: STAFF_ROLE_LABELS, resetHours: RESET_HOURS,
      link: req.query.link || null, pwlink: req.query.pwlink || null,
      ok: req.query.ok || null, err: req.query.err || null });
  } catch (e) { next(e); }
});

router.post("/utilisateurs/:id/roles", requireAdmin, async (req, res, next) => {
  try {
    const target = (await q("SELECT id, role FROM users WHERE id = $1", [req.params.id]))[0];
    if (!target) return res.redirect("/admin/utilisateurs?err=introuvable");
    if (target.role === "admin") return res.redirect("/admin/utilisateurs?err=admin");
    await q("UPDATE users SET staff_roles = $1 WHERE id = $2", [rolesFromBody(req.body), req.params.id]);
    res.redirect("/admin/utilisateurs?ok=roles");
  } catch (e) { next(e); }
});

router.post("/utilisateurs/inviter", requireAdmin, async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const first_name = (req.body.first_name || "").trim();
    const roles = rolesFromBody(req.body);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.redirect("/admin/utilisateurs?err=email");
    if (!roles) return res.redirect("/admin/utilisateurs?err=roles");
    const token = crypto.randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 7 * 864e5).toISOString();
    await q("INSERT INTO staff_invitations (token, email, first_name, roles, expires_at) VALUES ($1,$2,$3,$4,$5)",
      [token, email, first_name, roles, expires]);
    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3001";
    res.redirect("/admin/utilisateurs?link=" + encodeURIComponent(`${base}/invitation/${token}`));
  } catch (e) { next(e); }
});

router.post("/utilisateurs/invitations/:id/supprimer", requireAdmin, async (req, res, next) => {
  try {
    await q("DELETE FROM staff_invitations WHERE id = $1 AND used_at IS NULL", [req.params.id]);
    res.redirect("/admin/utilisateurs?ok=suppr");
  } catch (e) { next(e); }
});

// Lien « définir / réinitialiser le mot de passe » d'un collaborateur (aucun email requis :
// le lien s'affiche à l'écran, l'admin le transmet lui-même).
router.post("/utilisateurs/:id/mot-de-passe", requireAdmin, async (req, res, next) => {
  try {
    const u = (await q("SELECT id, email FROM users WHERE id = $1", [req.params.id]))[0];
    if (!u) return res.redirect("/admin/utilisateurs?err=introuvable");
    const link = await createResetLink(u.id);
    if (req.body.envoyer) {
      try {
        await mailer.send({
          to: u.email,
          subject: "Move — définir votre mot de passe",
          text: `Bonjour,\n\nPour définir votre mot de passe Move, ouvrez ce lien (valable ${RESET_HOURS} h, à usage unique) :\n${link}\n\n`
            + `Ensuite, vous vous connecterez toujours avec votre email et ce mot de passe.\n\nL'équipe Move — France Room`
        });
      } catch (e) { console.error("[reset admin] email non envoyé", e && e.message); }
    }
    res.redirect("/admin/utilisateurs?pwlink=" + encodeURIComponent(link));
  } catch (e) { next(e); }
});

router.post("/utilisateurs/mot-de-passe-par-email", requireAdmin, async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const u = (await q("SELECT id FROM users WHERE email = $1", [email]))[0];
    if (!u) return res.redirect("/admin/utilisateurs?err=compte");
    const link = await createResetLink(u.id);
    res.redirect("/admin/utilisateurs?pwlink=" + encodeURIComponent(link));
  } catch (e) { next(e); }
});

router.post("/utilisateurs/roles-par-email", requireAdmin, async (req, res, next) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const u = (await q("SELECT id, role FROM users WHERE email = $1", [email]))[0];
    if (!u) return res.redirect("/admin/utilisateurs?err=compte");
    if (u.role === "admin") return res.redirect("/admin/utilisateurs?err=admin");
    await q("UPDATE users SET staff_roles = $1 WHERE id = $2", [rolesFromBody(req.body), u.id]);
    res.redirect("/admin/utilisateurs?ok=roles");
  } catch (e) { next(e); }
});

module.exports = router;
