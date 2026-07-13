// Demandes de réservation (request-to-book) + paiement du 1er mois (Stripe Checkout).
const express = require("express");
const router = express.Router();
const { q } = require("../lib/db");
const L = require("../lib/listings");
const cal = require("../lib/calendar");
const { isoDate } = require("../lib/calendar");
const stripe = require("../lib/stripe");
const mailer = require("../lib/mailer");
const { requireUser } = require("./auth");

const RESERVE_POUR = ["entreprise", "usage_personnel", "residence_principale"];
const adminEmail = () => process.env.ADMIN_NOTIF_EMAIL || "hello@france-room.fr";
const baseUrl = () => process.env.PUBLIC_BASE_URL || "http://localhost:3001";

function addMonths(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
  if (target.getUTCDate() !== d.getUTCDate()) target.setUTCDate(0); // fin de mois
  return target.toISOString().slice(0, 10);
}

// ── Formulaire ──
router.get("/logement/:slug/demande", requireUser, async (req, res, next) => {
  try {
    const l = await L.bySlug(req.params.slug);
    if (!l || l.status !== "published") return res.status(404).render("pages/404");
    res.render("pages/demande", { title: res.locals.t("request.title"), l, euros: L.euros, error: null, form: {} });
  } catch (e) { next(e); }
});

router.post("/logement/:slug/demande", requireUser, async (req, res, next) => {
  try {
    const l = await L.bySlug(req.params.slug);
    if (!l || l.status !== "published") return res.status(404).render("pages/404");
    const f = {
      start_date: req.body.start_date || "",
      months: Math.max(1, Math.min(24, Number(req.body.months) || 0)),
      reserve_pour: req.body.reserve_pour || "",
      message: (req.body.message || "").trim().slice(0, 4000)
    };
    const bad = (msg) => res.status(400).render("pages/demande", { title: res.locals.t("request.title"), l, euros: L.euros, error: msg, form: f });
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start_date) || f.start_date < today) return bad(res.locals.t("request.badDate"));
    if (f.months < l.min_months) return bad(res.locals.t("request.tooShort", { n: l.min_months }));
    if (!RESERVE_POUR.includes(f.reserve_pour)) return bad(res.locals.t("request.badReserveFor"));
    const end = addMonths(f.start_date, f.months);
    if (!(await cal.isRangeFree(l.id, f.start_date, end))) return bad(res.locals.t("request.notFree"));
    const total = l.loyer_mensuel_cts + l.frais_menage_cts;
    const rows = await q(
      `INSERT INTO booking_requests (listing_id, tenant_id, start_date, end_date, reserve_pour, message, total_first_month_cts)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [l.id, req.session.user.id, f.start_date, end, f.reserve_pour, f.message, total]);
    await mailer.send({ to: adminEmail(), subject: `[Move] Nouvelle demande #${rows[0].id} — ${l.title_fr}`,
      text: `Demande de ${req.session.user.email}\nDu ${f.start_date} au ${end} (${f.months} mois)\nRéserve pour : ${f.reserve_pour}\nMessage : ${f.message || "-"}\n→ ${baseUrl()}/admin/demandes` });
    await mailer.send({ to: req.session.user.email, subject: res.locals.t("mail.requestSent.subject"),
      text: res.locals.t("mail.requestSent.body", { title: l.title_fr, start: f.start_date }) });
    res.redirect("/compte?demande=envoyee");
  } catch (e) { next(e); }
});

// ── Espace locataire ──
router.get("/compte", requireUser, async (req, res, next) => {
  try {
    const reqs = await q(
      `SELECT r.*, l.title_fr, l.title_en, l.slug FROM booking_requests r
       JOIN listings l ON l.id = r.listing_id WHERE r.tenant_id = $1 ORDER BY r.created_at DESC`,
      [req.session.user.id]);
    res.render("pages/compte", { title: res.locals.t("account.title"), reqs, euros: L.euros,
      flash: req.query.demande || req.query.paiement || null, cflash: req.query.caution || null });
  } catch (e) { next(e); }
});

// ── Paiement du 1er mois ──
router.post("/demande/:id/payer", requireUser, async (req, res, next) => {
  try {
    const rows = await q(
      `SELECT r.*, l.title_fr, l.slug, l.id AS lid FROM booking_requests r JOIN listings l ON l.id = r.listing_id
       WHERE r.id = $1 AND r.tenant_id = $2`, [req.params.id, req.session.user.id]);
    const r = rows[0];
    if (!r || r.status !== "accepted") return res.status(400).send("Demande non payable");
    // Simulation en dev sandbox (pas de clé Stripe) — clairement bornée
    if (process.env.DEV_FAKE_DB === "1" && !process.env.STRIPE_SECRET_KEY) {
      await markPaid(r.id, "dev-simulation");
      return res.redirect("/compte?paiement=ok");
    }
    const session = await stripe.call("/v1/checkout/sessions", {
      mode: "payment",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][product_data][name]": `Move — 1er mois + ménage : ${r.title_fr}`,
      "line_items[0][price_data][unit_amount]": r.total_first_month_cts,
      "line_items[0][quantity]": 1,
      client_reference_id: String(r.id),
      customer_email: req.session.user.email,
      success_url: `${baseUrl()}/compte?paiement=ok`,
      cancel_url: `${baseUrl()}/compte?paiement=annule`
    }, process.env.STRIPE_SECRET_KEY);
    await q("UPDATE booking_requests SET stripe_session_id = $1, updated_at = now() WHERE id = $2", [session.id, r.id]);
    res.redirect(303, session.url);
  } catch (e) { next(e); }
});

async function markPaid(requestId, ref) {
  const rows = await q("SELECT * FROM booking_requests WHERE id = $1", [requestId]);
  const r = rows[0];
  if (!r || r.status === "paid") return;
  await q("UPDATE booking_requests SET status = 'paid', updated_at = now() WHERE id = $1", [requestId]);
  await cal.addBlock(r.listing_id, isoDate(r.start_date), isoDate(r.end_date), "booking", `demande-${requestId}${ref ? ":" + ref : ""}`);
  const t = await q("SELECT u.email FROM users u JOIN booking_requests r ON r.tenant_id = u.id WHERE r.id = $1", [requestId]);
  if (t[0]) await mailer.send({ to: t[0].email, subject: "Move — paiement reçu, réservation confirmée",
    text: `Votre paiement est bien reçu. Votre réservation est confirmée du ${isoDate(r.start_date)} au ${isoDate(r.end_date)}.\nNotre équipe vous contacte pour l'entrée dans les lieux.` });
  await mailer.send({ to: adminEmail(), subject: `[Move] Demande #${requestId} PAYÉE`, text: `Le 1er mois est payé. Calendrier bloqué.` });
}

// ── Webhook Stripe (corps brut) ──
router.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const raw = req.body.toString("utf8");
    if (!stripe.verifyWebhook(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).send("signature invalide");
    }
    const event = JSON.parse(raw);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      if (s.client_reference_id) await markPaid(Number(s.client_reference_id), s.id);
    }
    res.json({ received: true });
  } catch (e) { console.error("[webhook]", e); res.status(500).send("erreur"); }
});

module.exports = { router, markPaid };
