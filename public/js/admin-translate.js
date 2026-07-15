// Bouton « Traduire le FR en anglais » — remplit title_en / description_en (éditables).
(function () {
  var btn = document.getElementById("btn-traduire");
  if (!btn) return;
  var info = document.getElementById("translate-info");
  btn.addEventListener("click", async function () {
    var fr = (document.getElementById("title_fr") || {}).value || "";
    var frd = (document.getElementById("description_fr") || {}).value || "";
    if (!fr.trim() && !frd.trim()) { info.textContent = "Remplissez d'abord le titre ou la description en français."; return; }
    btn.disabled = true; info.textContent = "Traduction en cours…";
    try {
      var r = await fetch("/admin/traduire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title_fr: fr, description_fr: frd })
      });
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erreur");
      if (data.title_en) document.getElementById("title_en").value = data.title_en;
      if (data.description_en) document.getElementById("description_en").value = data.description_en;
      info.textContent = "Traduit ✓ — vous pouvez retoucher l'anglais avant d'enregistrer.";
    } catch (e) {
      info.textContent = "Échec : " + e.message;
    } finally { btn.disabled = false; }
  });
})();
