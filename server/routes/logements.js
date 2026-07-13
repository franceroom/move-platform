const express = require("express");
const router = express.Router();
const L = require("../lib/listings");
const cal = require("../lib/calendar");

router.get("/logements", async (req, res, next) => {
  try {
    const budgetMaxCts = req.query.budget ? Math.round(Number(req.query.budget) * 100) : null;
    const filters = {
      ville: req.query.ville || "",
      cat: req.query.cat || "",
      sous: req.query.sous || "",
      budgetMaxCts: Number.isFinite(budgetMaxCts) && budgetMaxCts > 0 ? budgetMaxCts : null
    };
    const results = await L.search(filters);
    const pins = results
      .filter(l => l.lat != null && l.lng != null)
      .map(l => ({ slug: l.slug, lat: l.lat, lng: l.lng, price: L.euros(l.loyer_mensuel_cts) }));
    res.render("pages/search", {
      title: res.locals.t("search.title"),
      results, filters, euros: L.euros,
      pins: JSON.stringify(pins),
      mapboxToken: process.env.MAPBOX_TOKEN || ""
    });
  } catch (e) { next(e); }
});

router.get("/logement/:slug", async (req, res, next) => {
  try {
    const l = await L.bySlug(req.params.slug);
    if (!l || l.status !== "published") return res.status(404).render("pages/404");
    const months = await cal.monthsModel(l.id, 3);
    res.render("pages/listing", {
      months,
      title: req.locale === "en" && l.title_en ? l.title_en : l.title_fr,
      metaDescription: (req.locale === "en" && l.description_en ? l.description_en : l.description_fr).slice(0, 155),
      l, euros: L.euros,
      mapboxToken: process.env.MAPBOX_TOKEN || ""
    });
  } catch (e) { next(e); }
});

module.exports = router;
