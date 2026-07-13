(function () {
  var el = document.getElementById("map");
  if (!el || !el.dataset.token) return;
  var pins = [];
  try { pins = JSON.parse(el.dataset.pins || "[]"); } catch (e) {}
  mapboxgl.accessToken = el.dataset.token;
  var map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: pins.length ? [pins[0].lng, pins[0].lat] : [2.3522, 46.6],
    zoom: pins.length ? 11 : 5
  });
  map.addControl(new mapboxgl.NavigationControl(), "top-left");
  var bounds = new mapboxgl.LngLatBounds();
  pins.forEach(function (p) {
    var elp = document.createElement("a");
    elp.className = "map-pin";
    elp.href = "/logement/" + p.slug;
    elp.textContent = p.price + " €";
    new mapboxgl.Marker({ element: elp }).setLngLat([p.lng, p.lat]).addTo(map);
    bounds.extend([p.lng, p.lat]);
  });
  if (pins.length > 1) map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
})();
