const express = require("express");
const router = express.Router();
const { q } = require("../lib/db");

router.get("/", (req, res) => res.render("pages/home"));

// ── Confier mon bien (candidature propriétaire → owner_leads) ──
router.get("/confier-mon-bien", (req, res) => {
  res.render("pages/owners", { title: res.locals.t("owners.title"), sent: req.query.ok === "1", errors: null, form: {} });
});

router.post("/confier-mon-bien", async (req, res, next) => {
  try {
    const f = {
      nom: (req.body.nom || "").trim(),
      email: (req.body.email || "").trim().toLowerCase(),
      phone: (req.body.phone || "").trim(),
      ville: (req.body.ville || "").trim(),
      message: (req.body.message || "").trim().slice(0, 4000)
    };
    if (!f.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
      return res.status(400).render("pages/owners", { title: res.locals.t("owners.title"), sent: false, errors: res.locals.t("owners.form.error"), form: f });
    }
    await q("INSERT INTO owner_leads (nom, email, phone, ville, message) VALUES ($1,$2,$3,$4,$5)",
      [f.nom, f.email, f.phone, f.ville, f.message]);
    res.redirect("/confier-mon-bien?ok=1");
  } catch (e) { next(e); }
});

// ── À propos ──
router.get("/a-propos", (req, res) => res.render("pages/about", { title: res.locals.t("about.title") }));

// ── Pages légales : contenus fournis par France Room / son conseil (jamais rédigés ici). ──
for (const slug of ["mentions-legales", "cgu", "confidentialite"]) {
  router.get("/" + slug, (req, res) => res.render("pages/legal", { title: res.locals.t("legal." + slug), slug }));
}

module.exports = router;
