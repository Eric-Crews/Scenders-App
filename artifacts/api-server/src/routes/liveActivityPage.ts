export function renderLiveActivityPage(token: string): string {
  const tokenJson = JSON.stringify(token);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow,noarchive" />
<meta name="referrer" content="no-referrer" />
<title>Live activity · mapper.one</title>
<link rel="preconnect" href="https://unpkg.com" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
:root{--bg:#f7f6ef;--card:#fffefa;--ink:#213329;--muted:#627065;--line:#d9ded4;--green:#295b44;--alert:#bf5d3e}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
body{padding-bottom:2.5rem}.shell{width:min(760px,100%);margin:0 auto}.top{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--line)}
.brand{font:700 1.12rem Georgia,serif;color:var(--ink);text-decoration:none}.brand span{color:var(--green)}.status{font-size:.74rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--green);display:flex;align-items:center;gap:.42rem}.dot{width:.55rem;height:.55rem;border-radius:999px;background:#39a267;box-shadow:0 0 0 .18rem #d9f0df}.dot.done{background:#8c958d;box-shadow:none}
main{padding:1.5rem 1.25rem}.eyebrow{margin:0 0:.55rem;font-size:.73rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--green)}h1{font:700 clamp(2rem,8vw,3.4rem)/.98 Georgia,serif;letter-spacing:-.04em;margin:0;max-width:13ch}.updated{margin:.9rem 0 1.2rem;color:var(--muted);line-height:1.45}.updated strong{color:var(--ink)}
#map{height:min(48vh,390px);min-height:285px;border:1px solid var(--line);border-radius:1.1rem;overflow:hidden;background:repeating-linear-gradient(45deg,#edf0e8 0,#edf0e8 14px,#e8ece3 14px,#e8ece3 28px)}.leaflet-container{background:transparent}.map-note{font-size:.76rem;color:var(--muted);margin:.6rem .15rem 0}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin:1rem 0}.stat{background:var(--card);border:1px solid var(--line);border-radius:.85rem;padding:.8rem}.stat strong{display:block;font-size:1rem}.stat span{display:block;color:var(--muted);font-size:.72rem;margin-top:.15rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:1rem;margin-top:1rem}.card h2{font:700 1.25rem Georgia,serif;margin:0 0:.75rem}.messages{display:grid;gap:.65rem;max-height:245px;overflow:auto;padding-right:.2rem}.message{background:#eef3ec;border-radius:.7rem;padding:.65rem .75rem;line-height:1.35;font-size:.92rem}.message.owner{background:#e0eee5}.message b{display:block;font-size:.74rem;margin-bottom:.16rem;color:var(--green)}
form{display:grid;gap:.55rem;margin-top:.85rem}input,textarea{font:inherit;border:1px solid var(--line);border-radius:.65rem;padding:.7rem .75rem;background:#fff;color:var(--ink)}textarea{min-height:5rem;resize:vertical}button{font:700 .9rem Inter,system-ui,sans-serif;border:0;border-radius:999px;padding:.75rem 1.1rem;background:var(--green);color:white;cursor:pointer;justify-self:start}button:disabled{opacity:.55;cursor:wait}.note{font-size:.78rem;line-height:1.4;color:var(--muted);margin:.75rem 0 0}.unavailable{padding:6rem 1.5rem;text-align:center}.unavailable h1{margin:0 auto 1rem;font-size:2.3rem}.unavailable p{color:var(--muted);line-height:1.55}
@media(min-width:720px){main{padding:2.25rem}.top{padding:1rem 2.25rem}.stats{gap:.85rem}.card{padding:1.25rem}}
</style></head><body>
<div class="shell"><header class="top"><a class="brand" href="https://mapper.one">◎ mapper<span>.one</span></a><div class="status" id="status"><i class="dot"></i> Loading</div></header>
<main id="app"><div class="card"><p>Loading this activity…</p></div></main></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(() => {
  const token = ${tokenJson}; let map, line, current; let rendered = false;
  const app = document.getElementById('app'), status = document.getElementById('status');
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const distance = (meters) => meters >= 1609.344 ? (meters / 1609.344).toFixed(meters < 16093 ? 1 : 0) + ' mi' : Math.round(meters) + ' ft';
  const duration = (milliseconds) => { const s = Math.max(0, Math.floor(milliseconds / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(r).padStart(2,'0') : m + ':' + String(r).padStart(2,'0'); };
  const elapsed = (iso) => { if (!iso) return 'No location update yet'; const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); if (seconds < 60) return 'Last updated just now'; const minutes = Math.floor(seconds / 60); return 'Last updated ' + (minutes < 60 ? minutes + ' min ago' : Math.floor(minutes / 60) + ' hr ago'); };
  function setMap(activity) {
    const coords = activity.points.map((point) => [point.lat, point.lng]);
    if (!map) map = L.map('map', { zoomControl: true, attributionControl: false });
    if (line) map.removeLayer(line); if (current) map.removeLayer(current);
    if (coords.length) { line = L.polyline(coords, { color:'#c8633a', weight:4, opacity:.95 }).addTo(map); map.fitBounds(line.getBounds(), { padding:[24,24] }); }
    else map.setView([20,0],2);
    if (activity.currentLatitude != null && activity.currentLongitude != null) current = L.circleMarker([activity.currentLatitude,activity.currentLongitude], {radius:8,color:'#fff',weight:3,fillColor:'#295b44',fillOpacity:1}).addTo(map);
  }
  function render(activity) {
    const active = activity.status === 'active';
    status.innerHTML = '<i class="dot ' + (active ? '' : 'done') + '"></i>' + (active ? 'Live' : 'Complete');
    if (!rendered) {
      app.innerHTML = '<p class="eyebrow">Live route powered by mapper.one</p><h1 id="title"></h1><p class="updated" id="updated"></p><div id="map"></div><p class="map-note">Private live route. Map tiles are intentionally not loaded.</p><section class="stats"><div class="stat"><strong id="distance"></strong><span>distance</span></div><div class="stat"><strong id="duration"></strong><span>elapsed</span></div><div class="stat"><strong id="points"></strong><span>GPS points</span></div></section><section class="card"><h2>Messages</h2><div class="messages" id="messages"></div><form id="message-form"><input id="sender" maxlength="100" placeholder="Your name (optional)" autocomplete="name"><textarea id="body" maxlength="500" placeholder="Send a message…" required></textarea><button type="submit">Send message</button></form><p class="note">Messages are delivered when the recorder has service. This page does not show an emergency response service.</p></section><p class="note">Offline mapping and GPS tracking for wherever you go. <a href="https://mapper.one">Get mapper.one</a></p>';
      document.getElementById('message-form').addEventListener('submit', sendMessage); rendered = true;
    }
    document.getElementById('title').textContent = activity.displayName + '’s ' + activity.name;
    const stale = activity.lastUpdatedAt && Date.now() - new Date(activity.lastUpdatedAt).getTime() > 5 * 60 * 1000;
    document.getElementById('updated').innerHTML = '<strong>' + escape(elapsed(activity.lastUpdatedAt)) + '</strong>' + (active && stale ? '<br>Their device may currently be outside cellular coverage. This is the last reported location.' : active ? '<br>Route updates while their phone has service.' : '<br>This activity has ended.');
    document.getElementById('distance').textContent = distance(activity.distanceMeters);
    document.getElementById('duration').textContent = duration(activity.durationMs);
    document.getElementById('points').textContent = activity.pointCount;
    document.getElementById('messages').innerHTML = activity.messages.length ? activity.messages.map((message) => '<div class="message ' + (message.senderKind === 'owner' ? 'owner' : '') + '"><b>' + escape(message.senderName) + '</b>' + escape(message.body) + '</div>').join('') : '<p class="note">No messages yet.</p>';
    setMap(activity);
  }
  async function load() {
    try { const response = await fetch('/api/live/' + encodeURIComponent(token), { cache:'no-store' }); if (!response.ok) throw new Error(); render(await response.json()); }
    catch { status.textContent = 'Unavailable'; app.innerHTML = '<div class="unavailable"><h1>This activity is unavailable.</h1><p>The link may have been stopped by its owner.</p><p><a href="https://mapper.one">Go to mapper.one</a></p></div>'; }
  }
  async function sendMessage(event) {
    event.preventDefault(); const name = document.getElementById('sender'), body = document.getElementById('body'), button = event.currentTarget.querySelector('button'); const text = body.value.trim(); if (!text) return;
    button.disabled = true; button.textContent = 'Sending…';
    try { const response = await fetch('/api/live/' + encodeURIComponent(token) + '/messages', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ senderName:name.value.trim() || undefined, body:text })}); if (!response.ok) throw new Error(); body.value = ''; await load(); }
    catch { button.textContent = 'Try again'; alert('Your message could not be sent. Please try again in a moment.'); }
    finally { button.disabled = false; if (button.textContent !== 'Try again') button.textContent = 'Send message'; }
  }
  load(); setInterval(() => { if (!document.hidden) load(); }, 15000);
})();
</script></body></html>`;
}