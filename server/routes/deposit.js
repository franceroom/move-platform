// CAUTION — portage du module éprouvé (compte Stripe cautions séparé).
// Garde-fous : mode TEST par défaut (exige une clé rk_test_/sk_test_) ; DEPOSIT_LIVE='true' (posé par
// Elhadji uniquement) pour utiliser DEPOSIT_STRIPE_KEY. Remboursement auto à refundDueAt (fin de séjour + 2 j),
// sauf statut 'litige' posé à la main. Jamais de clé écrite ici : env Render.
const express = require("express");
const router = express.Router();
const { q } = require("../lib/db");
const { isoDate } = require("../lib/calendar");
const stripe = require("../lib/stripe");
const mailer = require("../lib/mailer");
const { requireUser } = require("./auth");

const baseUrl = () => process.env.PUBLIC_BASE_URL || "http://localhost:3001";
const adminEmail = () => process.env.ADMIN_NOTIF_EMAIL || "hello@france-room.fr";

function depositKey() {
  if (process.env.DEPOSIT_LIVE === "true") {
    if (!process.env.DEPOSIT_STRIPE_KEY) throw new Error("Caution : DEPOSIT_STRIPE_KEY manquante (mode live)");
    return { key: process.env.DEPOSIT_STRIPE_KEY, live: true };
  }
  const k = process.env.DEPOSIT_STRIPE_TEST_KEY;
  if (!k) throw new Error("Caution non configurée : DEPOSIT_STRIPE_TEST_KEY manquante");
  if (!/^(rk|sk)_test_/.test(k)) throw new Error("Caution : la clé de test doit être rk_test_/sk_test_");
  return { key: k, live: false };
}

async function reqWithListing(id) {
  const rows = await q(
    `SELECT r.*, l.title_fr, l.depot_garantie_cts, u.email AS tenant_email
     FROM booking_requests r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.tenant_id
     WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

async function setDeposit(id, status, metaPatch) {
  const r = await reqWithListing(id);
  const meta = Object.assign({}, typeof r.deposit_meta === "string" ? JSON.parse(r.deposit_meta || "{}") : (r.deposit_meta || {}), metaPatch || {});
  await q("UPDATE booking_requests SET deposit_status = $1, deposit_meta = $2, updated_at = now() WHERE id = $3",
    [status, JSON.stringify(meta), id]);
  return { r, meta };
}

// ── Paiement de la caution (locataire, après paiement du 1er mois) ──
router.post("/pay/:id", requireUser, async (req, res, next) => {
  try {
    const r = await reqWithListing(req.params.id);
    if (!r || r.tenant_id !== req.session.user.id) return res.status(404).send("Introuvable");
    if (r.status !== "paid" || !(r.depot_garantie_cts > 0)) return res.status(400).send("Caution non applicable");
    if (r.deposit_status === "paye" || r.deposit_status === "rembourse") return res.redirect("/compte?caution=deja-payee");
    // Simulation dev bornée
    if (process.env.DEV_FAKE_DB === "1" && !process.env.DEPOSIT_STRIPE_TEST_KEY) {
      const due = new Date(new Date(isoDate(r.end_date)).getTime() + 2 * 86400000).toISOString().slice(0, 10);
      await setDeposit(r.id, "paye", { simulated: true, amount: r.depot_garantie_cts, paidAt: new Date().toISOString(), refundDueAt: due, live: false });
      return res.redirect("/compte?caution=ok");
    }
    const { key, live } = depositKey();
    const session = await stripe.call("/v1/checkout/sessions", {
      mode: "payment",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][product_data][name]": `Dépôt de garantie — ${r.title_fr}`,
      "line_items[0][price_data][unit_amount]": r.depot_garantie_cts,
      "line_items[0][quantity]": 1,
      "payment_intent_data[metadata][move_request_id]": String(r.id),
      client_reference_id: String(r.id),
      customer_email: r.tenant_email,
      success_url: `${baseUrl()}/compte?caution=ok`,
      cancel_url: `${baseUrl()}/compte?caution=annule`
    }, key);
    await setDeposit(r.id, "pending", { sessionId: session.id, live });
    res.redirect(303, session.url);
  } catch (e) { next(e); }
});

// ── Webhook compte cautions ──
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const raw = req.body.toString("utf8");
    const secret = process.env.DEPOSIT_WEBHOOK_SECRET;
    if (secret && !secret.startsWith("whsec_")) console.error("[caution] DEPOSIT_WEBHOOK_SECRET ne commence pas par whsec_");
    if (!stripe.verifyWebhook(raw, req.headers["stripe-signature"], secret)) return res.status(400).send("signature invalide");
    const event = JSON.parse(raw);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const id = Number(s.client_reference_id);
      const r = await reqWithListing(id);
      if (r) {
        const due = new Date(new Date(isoDate(r.end_date)).getTime() + 2 * 86400000).toISOString().slice(0, 10);
        await setDeposit(id, "paye", { paymentIntentId: s.payment_intent, amount: s.amount_total, paidAt: new Date().toISOString(), refundDueAt: due, live: event.livemode === true });
        await mailer.send({ to: r.tenant_email, subject: "Move — dépôt de garantie bien reçu",
          text: `Votre dépôt de garantie est bien enregistré. Il vous sera remboursé automatiquement sous 48 h après votre départ (hors retenue justifiée).` });
        await mailer.send({ to: adminEmail(), subject: `[Move] Caution reçue — demande #${id}`, text: `Caution encaissée sur le compte cautions.` });
      }
    }
    res.json({ received: true });
  } catch (e) { console.error("[caution webhook]", e); res.status(500).send("erreur"); }
});

// ── Remboursements automatiques ──
async function refundRun() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await q("SELECT id, deposit_meta FROM booking_requests WHERE deposit_status = 'paye'");
  let refunded = 0, skipped = 0, errors = [];
  for (const row of rows) {
    const meta = typeof row.deposit_meta === "string" ? JSON.parse(row.deposit_meta || "{}") : (row.deposit_meta || {});
    if (!meta.refundDueAt || meta.refundDueAt > today) { skipped++; continue; }
    try {
      if (meta.simulated) {
        await setDeposit(row.id, "rembourse", { refundedAt: new Date().toISOString(), refundId: "simu" });
      } else {
        const { key, live } = depositKey();
        if (Boolean(meta.live) !== live) { skipped++; continue; } // clé/mode incohérents → ne pas toucher
        const refund = await stripe.call("/v1/refunds", { payment_intent: meta.paymentIntentId }, key);
        await setDeposit(row.id, "rembourse", { refundedAt: new Date().toISOString(), refundId: refund.id });
      }
      const r = await reqWithListing(row.id);
      await mailer.send({ to: r.tenant_email, subject: "Move — dépôt de garantie remboursé",
        text: "Votre dépôt de garantie vient d'être remboursé sur votre moyen de paiement (délai bancaire : quelques jours)." });
      refunded++;
    } catch (e) {
      errors.push(`#${row.id}: ${e.message}`);
      await setDeposit(row.id, "erreur_remboursement", { lastError: e.message, lastErrorAt: new Date().toISOString() });
    }
  }
  return { refunded, skipped, errors };
}

router.get("/refund-run", async (req, res) => {
  if (!process.env.ICAL_SYNC_TOKEN || req.query.token !== process.env.ICAL_SYNC_TOKEN) return res.status(403).json({ error: "token invalide" });
  try { res.json(await refundRun()); } catch (e) { res.status(500).json({ error: e.message }); }
});

const hours = Number(process.env.DEPOSIT_REFUND_INTERVAL_HOURS || 6);
if (hours > 0) setInterval(() => refundRun().then(r => console.log("[caution]", JSON.stringify(r))).catch(e => console.error("[caution]", e)), hours * 3600 * 1000);

if (process.env.DEV_FAKE_DB === "1") {
  router.post("/dev-force-due/:id", async (req, res) => {
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await setDeposit(req.params.id, "paye", { refundDueAt: hier });
    res.json({ forced: hier });
  });
}

module.exports = { router, refundRun };
