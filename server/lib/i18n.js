const fs = require("fs");
const path = require("path");

const locales = {};
for (const loc of ["fr", "en"]) {
  locales[loc] = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "locales", `${loc}.json`), "utf8"));
}

function translate(loc, key, vars = {}) {
  let s = (locales[loc] && locales[loc][key]) || locales.fr[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Locale : ?lang=xx > session > Accept-Language > fr
function i18nMiddleware(req, res, next) {
  let loc = null;
  if (req.query.lang === "fr" || req.query.lang === "en") {
    loc = req.query.lang;
    req.session.lang = loc;
  } else if (req.session.lang) {
    loc = req.session.lang;
  } else {
    const al = (req.headers["accept-language"] || "").toLowerCase();
    loc = al.startsWith("en") ? "en" : "fr";
  }
  req.locale = loc;
  res.locals.locale = loc;
  res.locals.t = (key, vars) => translate(loc, key, vars);
  next();
}

module.exports = { i18nMiddleware, translate };
