// Filtre instantané de la liste d'annonces (client, aucun rechargement).
(function () {
  var input = document.getElementById("annonce-search");
  if (!input) return;
  var rows = Array.prototype.slice.call(document.querySelectorAll(".annonce-row"));
  var count = document.getElementById("search-count");
  function apply() {
    var q = input.value.trim().toLowerCase();
    var termes = q.split(/\s+/).filter(Boolean);
    var visibles = 0;
    rows.forEach(function (r) {
      var f = r.getAttribute("data-filtre") || "";
      var ok = termes.every(function (t) { return f.indexOf(t) !== -1; });
      r.style.display = ok ? "" : "none";
      if (ok) visibles++;
    });
    count.textContent = q ? (visibles + " / " + rows.length + " annonce(s)") : "";
  }
  input.addEventListener("input", apply);
})();
