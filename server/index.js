require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const { i18nMiddleware } = require("./lib/i18n");
const { hasRole } = require("./routes/auth");

const app = express();
app.set("trust proxy", 1); // Render est derrière un proxy : requis pour les cookies "secure"
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(cookieSession({
  name: "move.sess",
  keys: [process.env.SESSION_SECRET || "dev-secret-change-me"],
  maxAge: 30 * 24 * 3600 * 1000,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  httpOnly: true
}));

// Session glissante : on « touche » la session une fois par jour d'utilisation pour que le
// cookie de 30 jours soit renouvelé — un utilisateur régulier reste connecté sans limite.
app.use((req, res, next) => {
  if (req.session && req.session.user) {
    const day = Math.floor(Date.now() / 86400000);
    if (req.session.day !== day) req.session.day = day;
  }
  next();
});

app.use(i18nMiddleware);

app.use((req, res, next) => {
  res.locals.photoSrc = (p) => (p && p.url ? p.url : (p ? "/photo/" + p.id : ""));
  res.locals.isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  res.locals.path = req.path;
  res.locals.user = req.session.user || null;
  res.locals.hasRole = (r) => hasRole(req.session.user, r);
  res.locals.googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.locals.env = process.env.NODE_ENV || "development";
  next();
});

app.get("/sante", (req, res) => res.json({ ok: true, service: "move-platform", env: process.env.NODE_ENV || "dev" }));

const { router: authRouter } = require("./routes/auth");
app.use("/", require("./routes/pages"));
app.use("/", require("./routes/logements"));
app.use("/", authRouter);
app.use("/", require("./routes/demandes").router);
app.use("/", require("./routes/google").router);
app.use("/admin", require("./routes/admin"));
app.use("/ical", require("./routes/ical").router);
app.use("/deposit", require("./routes/deposit").router);

app.use((req, res) => res.status(404).render("pages/404"));

app.use((err, req, res, next) => {
  console.error("[erreur]", err);
  res.status(500).send("Erreur interne");
});

app.listen(PORT, () => console.log(`[move] démarré sur :${PORT}`));
