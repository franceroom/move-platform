(function () {
  var el = document.getElementById("map");
  if (!el || !el.dataset.token) return;
  mapboxgl.accessToken = el.dataset.token;
  var lat = Number(el.dataset.lat), lng = Number(el.dataset.lng);
  var map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [lng, lat],
    zoom: 13,
    interactive: true
  });
  // Zone approximative (confidentialité de l'adresse exacte)
  map.on("load", function () {
    map.addSource("zone", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] } } });
    map.addLayer({ id: "zone", type: "circle", source: "zone",
      paint: { "circle-radius": 60, "circle-color": "#FECE16", "circle-opacity": 0.35, "circle-stroke-color": "#231F20", "circle-stroke-width": 1 } });
  });
})();
