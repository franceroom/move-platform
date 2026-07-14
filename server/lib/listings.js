const { q } = require("./db");

const VILLES = ["paris", "marseille", "la-ciotat", "montpellier"];
const CATS = ["chambre", "appartement_maison"];
const SUBS = ["studio", "appartement", "maison"];

function euros(cts) {
  return (cts / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function slugify(s) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function search({ ville, cat, sous, budgetMaxCts }) {
  const cond = ["status = 'published'"];
  const params = [];
  if (ville && VILLES.includes(ville)) { params.push(ville); cond.push(`ville = $${params.length}`); }
  if (cat && CATS.includes(cat)) { params.push(cat); cond.push(`category = $${params.length}`); }
  if (sous && SUBS.includes(sous)) { params.push(sous); cond.push(`subcategory = $${params.length}`); }
  if (budgetMaxCts) { params.push(budgetMaxCts); cond.push(`loyer_mensuel_cts <= $${params.length}`); }
  const rows = await q(
    `SELECT * FROM listings WHERE ${cond.join(" AND ")} ORDER BY created_at DESC`, params);
  for (const l of rows) l.photos = await photosOf(l.id);
  return rows;
}

async function photosOf(listingId) {
  return q(
    "SELECT id, listing_id, url, alt, position, mime, (data IS NOT NULL) AS has_data FROM listing_photos WHERE listing_id = $1 ORDER BY position",
    [listingId]);
}

async function bySlug(slug) {
  const rows = await q("SELECT * FROM listings WHERE slug = $1", [slug]);
  if (!rows[0]) return null;
  rows[0].photos = await photosOf(rows[0].id);
  return rows[0];
}

async function byId(id) {
  const rows = await q("SELECT * FROM listings WHERE id = $1", [id]);
  if (!rows[0]) return null;
  rows[0].photos = await photosOf(rows[0].id);
  return rows[0];
}

async function allForAdmin() {
  return q("SELECT id, slug, status, title_fr, ville, category, subcategory, loyer_mensuel_cts, created_at FROM listings ORDER BY created_at DESC");
}

function fromForm(b) {
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const cents = (v) => Math.round((Number(String(v || "0").replace(",", ".")) || 0) * 100);
  return {
    title_fr: (b.title_fr || "").trim(),
    title_en: (b.title_en || "").trim(),
    description_fr: (b.description_fr || "").trim(),
    description_en: (b.description_en || "").trim(),
    category: CATS.includes(b.category) ? b.category : "appartement_maison",
    subcategory: SUBS.includes(b.subcategory) ? b.subcategory : null,
    ville: (b.ville || "").trim().toLowerCase(),
    quartier: (b.quartier || "").trim(),
    adresse: (b.adresse || "").trim(),
    lat: num(b.lat), lng: num(b.lng),
    surface_m2: num(b.surface_m2),
    meuble: b.meuble !== "non",
    charges_comprises: b.charges_comprises !== "non",
    type_de_bail: b.type_de_bail || "selon_situation",
    loyer_mensuel_cts: cents(b.loyer_mensuel),
    frais_menage_cts: cents(b.frais_menage),
    depot_garantie_cts: cents(b.depot_garantie),
    min_months: num(b.min_months) || 1,
    ical_import_urls: JSON.stringify(String(b.ical_import_urls || "").split(/\r?\n/).map(u => u.trim()).filter(u => /^https?:\/\//.test(u)))
  };
}

async function create(b) {
  const d = fromForm(b);
  let slug = slugify(d.title_fr) || `logement-${Date.now()}`;
  const clash = await q("SELECT 1 FROM listings WHERE slug = $1", [slug]);
  if (clash.length) slug = `${slug}-${Date.now().toString(36)}`;
  const rows = await q(
    `INSERT INTO listings (slug, title_fr, title_en, description_fr, description_en, category, subcategory,
       ville, quartier, adresse, lat, lng, surface_m2, meuble, charges_comprises, type_de_bail,
       loyer_mensuel_cts, frais_menage_cts, depot_garantie_cts, min_months, ical_import_urls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [slug, d.title_fr, d.title_en, d.description_fr, d.description_en, d.category, d.subcategory,
     d.ville, d.quartier, d.adresse, d.lat, d.lng, d.surface_m2, d.meuble, d.charges_comprises, d.type_de_bail,
     d.loyer_mensuel_cts, d.frais_menage_cts, d.depot_garantie_cts, d.min_months, d.ical_import_urls]);
  return rows[0].id;
}

async function update(id, b) {
  const d = fromForm(b);
  await q(
    `UPDATE listings SET title_fr=$1, title_en=$2, description_fr=$3, description_en=$4, category=$5, subcategory=$6,
       ville=$7, quartier=$8, adresse=$9, lat=$10, lng=$11, surface_m2=$12, meuble=$13, charges_comprises=$14,
       type_de_bail=$15, loyer_mensuel_cts=$16, frais_menage_cts=$17, depot_garantie_cts=$18, min_months=$19,
       ical_import_urls=$20, updated_at=now()
     WHERE id=$21`,
    [d.title_fr, d.title_en, d.description_fr, d.description_en, d.category, d.subcategory,
     d.ville, d.quartier, d.adresse, d.lat, d.lng, d.surface_m2, d.meuble, d.charges_comprises,
     d.type_de_bail, d.loyer_mensuel_cts, d.frais_menage_cts, d.depot_garantie_cts, d.min_months, d.ical_import_urls, id]);
}

// Photos : suppressions cochées + nouveaux fichiers (blobs) ajoutés à la suite.
async function applyPhotos(listingId, { deleteIds = [], files = [] } = {}) {
  for (const id of deleteIds) {
    await q("DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2", [id, listingId]);
  }
  const existing = await photosOf(listingId);
  let pos = existing.length ? Math.max(...existing.map(p => p.position)) + 1 : 0;
  for (const f of files) {
    await q("INSERT INTO listing_photos (listing_id, url, alt, position, data, mime) VALUES ($1,'',$2,$3,$4,$5)",
      [listingId, f.originalname || "", pos++, f.buffer, f.mimetype || "image/jpeg"]);
  }
}

async function setStatus(id, status) {
  if (!["draft", "published", "archived"].includes(status)) return;
  await q("UPDATE listings SET status=$1, updated_at=now() WHERE id=$2", [status, id]);
}

module.exports = { search, bySlug, byId, allForAdmin, create, update, applyPhotos, setStatus, euros, VILLES, CATS, SUBS };
