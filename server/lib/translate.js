// Traduction FR→EN via DeepL API Free (zéro dépendance, fetch natif).
// Actif seulement si DEEPL_API_KEY est posée. Les clés Free se terminent par ":fx".
function enabled() { return Boolean(process.env.DEEPL_API_KEY); }

async function toEnglish(text) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error("DEEPL_API_KEY manquante");
  if (!text || !text.trim()) return "";
  // Clé Free (…:fx) → api-free.deepl.com ; clé Pro → api.deepl.com
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const resp = await fetch(host + "/v2/translate", {
    method: "POST",
    headers: { Authorization: "DeepL-Auth-Key " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text, source_lang: "FR", target_lang: "EN", preserve_formatting: "1" }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error("DeepL " + resp.status + ": " + (data.message || ""));
  return (data.translations && data.translations[0] && data.translations[0].text) || "";
}

module.exports = { enabled, toEnglish };
