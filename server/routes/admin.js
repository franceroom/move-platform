// Administration France Room — interface interne en français.
const express = require("express");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 20 } });
const router = express.Router();
const L = require("../lib/listings");
const { requireAdmin } = require("./auth");
const translate = require("../lib/translate");
const cal = require("../lib/calendar");
const { isoDate } = require("../lib/calendar");
const { q } = require("../lib/db");
const mailer = require("../lib/mailer");

router.use(requireAdmin);

router.get("/", async (req, res, next) => {
  try {
    res.render("pages/admin/list", { title: "Admin", rows: await L.allForAdmin(), euros: L.euros });
  } catch (e) { next(e); }
});

router.get("/annonces/new", (req, res) => {
  res.render("pages/admin/form", { title: "Nouvelle annonce", l: null, photosText: "", icalText: "", blocks: [], translateEnabled: translate.enabled() });
});

router.post("/annonces/new", upload.array("photos"), async (req, res, next) => {
  try {
    const id = await L.create(req.body);
    await L.applyPhotos(id, { files: req.files || [] });
    res.redirect(`/admin/annonces/${id}/edit?ok=1`);
  } catch (e) { next(e); }
});

router.get("/annonces/:id/edit", async (req, res, next) => {
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

router.post("/annonces/:id/edit", upload.array("photos"), async (req, res, next) => {
  try {
    await L.update(req.params.id, req.body);
    const del = [].concat(req.body.delete_photo || []).map(Number).filter(Boolean);
    await L.applyPhotos(req.params.id, { deleteIds: del, files: req.files || [] });
    res.redirect(`/admin/annonces/${req.params.id}/edit?ok=1`);
  } catch (e) { next(e); }
});

router.post("/annonces/:id/status", async (req, res, next) => {
  try {
    await L.setStatus(req.params.id, req.body.status);
    res.redirect("/admin");
  } catch (e) { next(e); }
});

router.post("/annonces/:id/blocks", async (req, res, next) => {
  try {
    const { start_date, end_date } = req.body;
    if (start_date && end_date && end_date > start_date) {
      await cal.addBlock(req.params.id, start_date, end_date, "manual", "admin");
    }
    res.redirect(`/admin/annonces/${req.params.id}/edit`);
  } catch (e) { next(e); }
});

router.post("/annonces/:id/blocks/:blockId/delete", async (req, res, next) => {
  try {
    await cal.removeBlock(req.params.blockId, req.params.id);
    res.redirect(`/admin/annonces/${req.params.id}/edit`);
  } catch (e) { next(e); }
});

router.get("/demandes", async (req, res, next) => {
  try {
    const reqs = await q(
      `SELECT r.*, l.title_fr, l.slug, u.email AS tenant_email, u.first_name, u.last_name, u.phone
       FROM booking_requests r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.tenant_id
       ORDER BY r.created_at DESC`);
    res.render("pages/admin/requests", { title: "Demandes", reqs, euros: L.euros });
  } catch (e) { next(e); }
});

router.post("/demandes/:id/decision", async (req, res, next) => {
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

router.get("/proprietaires", async (req, res, next) => {
  try {
    const leads = await q("SELECT * FROM owner_leads ORDER BY created_at DESC");
    res.render("pages/admin/leads", { title: "Candidatures propriétaires", leads });
  } catch (e) { next(e); }
});

router.post("/traduire", express.json(), async (req, res) => {
  if (!translate.enabled()) return res.status(503).json({ error: "Traduction non configurée (DEEPL_API_KEY)" });
  try {
    const title = await translate.toEnglish(req.body.title_fr || "");
    const description = await translate.toEnglish(req.body.description_fr || "");
    res.json({ title_en: title, description_en: description });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
