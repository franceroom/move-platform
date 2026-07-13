// Export/import iCal — portage du module move-web, adossé à la base.
const express = require("express");
const router = express.Router();
const { q } = require("../lib/db");
const cal = require("../lib/calendar");
const ical = require("../lib/ical");

// Export : blocs booking + manual (pas les blocs importés, pour éviter les boucles)
router.get("/:slug.ics", async (req, res, next) => {
  try {
    const rows = await q("SELECT id, slug FROM listings WHERE slug = $1", [req.params.slug]);
    if (!rows[0]) return res.status(404).send("Not found");
    const blocks = (await cal.blocksOf(rows[0].id)).filter(b => b.source !== "ical");
    res.type("text/calendar").send(ical.generate(rows[0].slug, blocks));
  } catch (e) { next(e); }
});

// Import incrémental de tous les flux configurés. Protégé par token.
async function syncAll() {
  const listings = await q("SELECT id, slug, ical_import_urls FROM listings");
  let created = 0, deleted = 0, errors = [];
  for (const l of listings) {
    let urls = l.ical_import_urls;
    if (typeof urls === "string") { try { urls = JSON.parse(urls); } catch { urls = []; } }
    if (!Array.isArray(urls) || !urls.length) continue;
    const wanted = new Map(); // clé uid|start|end -> {start,end,ref}
    for (const url of urls) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        for (const ev of ical.parse(await resp.text())) {
          const ref = `${ev.uid || "sans-uid"}|${ev.start}|${ev.end}`;
          wanted.set(ref, { start: ev.start, end: ev.end, ref });
        }
      } catch (e) { errors.push(`${l.slug} ${url}: ${e.message}`); }
    }
    if (errors.some(er => er.startsWith(l.slug))) continue; // flux en erreur → ne pas supprimer
    const existing = (await cal.blocksOf(l.id)).filter(b => b.source === "ical");
    for (const b of existing) {
      if (!wanted.has(b.source_ref)) { await q("DELETE FROM calendar_blocks WHERE id = $1", [b.id]); deleted++; }
      else wanted.delete(b.source_ref);
    }
    for (const w of wanted.values()) { await cal.addBlock(l.id, w.start, w.end, "ical", w.ref); created++; }
  }
  return { created, deleted, errors };
}

router.get("/sync", async (req, res) => {
  if (!process.env.ICAL_SYNC_TOKEN || req.query.token !== process.env.ICAL_SYNC_TOKEN) {
    return res.status(403).json({ error: "token invalide" });
  }
  try { res.json(await syncAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Timer interne (ne tourne pas si l'instance dort — cron externe pour le live)
const hours = Number(process.env.ICAL_SYNC_INTERVAL_HOURS || 0);
if (hours > 0) setInterval(() => syncAll().then(r => console.log("[ical]", JSON.stringify(r))).catch(e => console.error("[ical]", e)), hours * 3600 * 1000);

module.exports = { router, syncAll };
