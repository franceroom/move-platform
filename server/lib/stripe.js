// Client Stripe minimal (fetch, form-encoded) + vérification de signature webhook — zéro dépendance.
const crypto = require("crypto");

function encode(obj, prefix = "") {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object" && !Array.isArray(v)) parts.push(encode(v, key));
    else if (Array.isArray(v)) v.forEach((x, i) => parts.push(typeof x === "object" ? encode(x, `${key}[${i}]`) : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(x)}`));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.filter(Boolean).join("&");
}

async function call(path, params, key) {
  if (!key) throw new Error("Clé Stripe manquante");
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: encode(params),
    signal: AbortSignal.timeout(20000)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Stripe ${resp.status}: ${data.error && data.error.message}`);
  return data;
}

// Signature "Stripe-Signature: t=...,v1=..." (tolérance 5 min)
function verifyWebhook(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); }
  catch { return false; }
}

module.exports = { call, verifyWebhook };
