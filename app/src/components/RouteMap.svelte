<script>
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  let { line } = $props();
  let el, map;

  $effect(() => {
    if (!el || !line) return;
    if (!map) {
      map = L.map(el, { zoomControl: false, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    }
    map.eachLayer((l) => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    const pts = line.pts || [];
    if (line.coords) L.polyline(line.coords.map(([lng, lat]) => [lat, lng]), { color: '#1f5fd1', weight: 5, opacity: 0.85 }).addTo(map);
    pts.forEach((p, i) => {
      const last = i === pts.length - 1, first = i === 0;
      const txt = last ? 'H' : first ? 'S' : String(i);
      const bg = last ? '#2b2420' : first ? '#1f5fbf' : '#3d7a4a';
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div style="background:${bg};color:#fff;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:700 13px system-ui;border:2px solid #fff;box-shadow:0 1px 3px #0005">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
    });
    const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng]));
    if (b.isValid()) map.fitBounds(b, { padding: [24, 24] });
  });
</script>

<div class="map" bind:this={el}></div>
