// Compression des photos côté navigateur avant envoi (max 1600 px, JPEG ~82 %).
(function () {
  var input = document.getElementById("photos-input");
  var form = document.getElementById("annonce-form");
  var info = document.getElementById("photos-info");
  if (!input || !form) return;
  var prepared = [];

  input.addEventListener("change", function () {
    prepared = [];
    var files = Array.from(input.files || []);
    if (!files.length) { info.textContent = ""; return; }
    info.textContent = "Préparation des photos…";
    var done = 0;
    files.forEach(function (file, i) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height;
        if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob(function (blob) {
          prepared[i] = new File([blob], (file.name || "photo").replace(/\.[a-z]+$/i, "") + ".jpg", { type: "image/jpeg" });
          URL.revokeObjectURL(img.src);
          if (++done === files.length) {
            var total = prepared.reduce(function (a, f) { return a + f.size; }, 0);
            info.textContent = prepared.length + " photo(s) prête(s) — " + Math.round(total / 1024) + " Ko au total";
          }
        }, "image/jpeg", 0.82);
      };
      img.onerror = function () { prepared[i] = file; if (++done === files.length) info.textContent = done + " photo(s) prête(s)"; };
      img.src = URL.createObjectURL(file);
    });
  });

  form.addEventListener("submit", function (e) {
    if (!prepared.length) return; // pas de photos → envoi normal
    e.preventDefault();
    var fd = new FormData(form);
    fd.delete("photos");
    prepared.forEach(function (f) { fd.append("photos", f); });
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }
    fetch(form.action || location.pathname, { method: "POST", body: fd, credentials: "include" })
      .then(function (r) { location.href = r.url || location.pathname; })
      .catch(function () { if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; } alert("Échec de l'envoi — réessayez."); });
  });
})();
