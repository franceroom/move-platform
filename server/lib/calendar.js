// Disponibilités : calendar_blocks (end_date EXCLUSIVE = date de départ).
const { q } = require("./db");

async function blocksOf(listingId) {
  return q("SELECT * FROM calendar_blocks WHERE listing_id = $1 ORDER BY start_date", [listingId]);
}

// Une plage [start, end) est libre si aucun bloc ne la chevauche.
async function isRangeFree(listingId, startISO, endISO) {
  const rows = await q(
    `SELECT 1 FROM calendar_blocks WHERE listing_id = $1 AND start_date < $2 AND end_date > $3 LIMIT 1`,
    [listingId, endISO, startISO]);
  return rows.length === 0;
}

async function addBlock(listingId, startISO, endISO, source = "manual", sourceRef = "") {
  await q(
    "INSERT INTO calendar_blocks (listing_id, start_date, end_date, source, source_ref) VALUES ($1,$2,$3,$4,$5)",
    [listingId, startISO, endISO, source, sourceRef]);
}

async function removeBlock(id, listingId) {
  await q("DELETE FROM calendar_blocks WHERE id = $1 AND listing_id = $2 AND source = 'manual'", [id, listingId]);
}

// Modèle de N mois pour l'affichage (SSR) : [{year, month, days:[{d, iso, blocked, past}]}]
function toISO(d) { return d.toISOString().slice(0, 10); }
function isoDate(v) { return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10); }

async function monthsModel(listingId, nMonths = 3) {
  const blocks = await blocksOf(listingId);
  const blocked = (iso) => blocks.some(b => {
    const s = isoDate(b.start_date), e = isoDate(b.end_date);
    return iso >= s && iso < e;
  });
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const todayISO = toISO(today);
  const out = [];
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  for (let m = 0; m < nMonths; m++) {
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, 1));
    const year = first.getUTCFullYear(), month = first.getUTCMonth();
    const nDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // Lundi = 0
    const firstDow = (first.getUTCDay() + 6) % 7;
    const days = [];
    for (let d = 1; d <= nDays; d++) {
      const iso = toISO(new Date(Date.UTC(year, month, d)));
      days.push({ d, iso, blocked: blocked(iso), past: iso < todayISO });
    }
    out.push({ year, month, firstDow, days });
  }
  return out;
}

module.exports = { blocksOf, isRangeFree, addBlock, removeBlock, monthsModel, isoDate };
