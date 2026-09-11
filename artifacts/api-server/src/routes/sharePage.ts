import { eq } from "drizzle-orm";
import { db, tracksTable } from "@workspace/db";
import { escapeHtml } from "../seo/ssrShared";
import { Router, type IRouter, type Request, type Response } from "express";
import { findPublishedGuideForSource } from "./trailGuides";
import { getPublicLiveActivity } from "./liveActivities";

const router: IRouter = Router();

/** App deep-link scheme (matches artifacts/mobile app.json `scheme`). */
const APP_SCHEME = "mobile";

const APP_BUNDLE_ID = "com.mapper.one";
type LatLng = [number, number];

/** Extract [lat, lng] pairs from a track's stored points JSON. */
function pointsToLatLngs(points: unknown): LatLng[] {
  if (!Array.isArray(points)) return [];
  const out: LatLng[] = [];
  for (const p of points) {
    if (!p || typeof p !== "object") continue;
    const lat = (p as { lat?: unknown }).lat;
    const lng = (p as { lng?: unknown }).lng;
    if (typeof lat === "number" && typeof lng === "number") {
      out.push([lat, lng]);
    }
  }
  return out;
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

function notFoundPage(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Route not found · mapper.one</title>
<style>
  body{margin:0;font-family:'Inter',system-ui,sans-serif;background:hsl(40 20% 95%);
    color:hsl(20 10% 15%);display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}
  .card{max-width:420px}
  h1{font-family:Georgia,serif;font-size:1.6rem;margin:0 0 8px}
  p{color:hsl(40 5% 45%);line-height:1.5}
  a{color:hsl(135 25% 30%);font-weight:600;text-decoration:none}
</style></head>
<body><div class="card">
  <h1>This route isn't available</h1>
  <p>The link may have expired or the owner stopped sharing it.</p>
  <p><a href="https://mapper.one">Go to mapper.one</a></p>
</div></body></html>`;
}

function liveActivityPage(token: string): string {
  // This capability page deliberately starts with no route data in its HTML.
  // The token holder fetches the live state from the no-store API after load,
  // keeping user geometry out of page metadata and social previews.
  const tokenJson = JSON.stringify(token)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow,noarchive" />
<title>Live activity · mapper.one</title>
<link rel="preconnect" href="https://unpkg.com" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
:root{--bg:#f4f2ed;--card:#fffdfa;--fg:#20271f;--muted:#657063;--line:#d9ddd4;--green:#315e43;--recorded:#c8633a;--red:#9b3c32}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif;line-height:1.45}
header{height:58px;display:flex;align-items:center;padding:0 18px;background:var(--card);border-bottom:1px solid var(--line)}
.brand{font:700 1.05rem Georgia,serif;color:var(--fg);text-decoration:none}.wrap{max-width:760px;margin:0 auto;padding:16px}
#map{height:min(48vh,420px);min-height:270px;background:#e9efe7;border:1px solid var(--line);border-radius:16px;overflow:hidden;position:relative}.empty-map{position:absolute;inset:0;z-index:500;display:grid;place-items:center;color:var(--muted);padding:28px;text-align:center;pointer-events:none}.map-legend{position:absolute;left:12px;bottom:12px;z-index:600;background:rgba(255,253,250,.94);border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:.76rem;display:grid;gap:5px;box-shadow:0 1px 5px rgba(0,0,0,.12)}.legend-row{display:flex;align-items:center;gap:6px}.legend-line{width:20px;border-top:4px solid var(--recorded);border-radius:3px}.legend-line.planned{border-top:3px dashed var(--green)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:14px}h1{font:700 1.55rem Georgia,serif;margin:0 0 5px}.owner{font-size:.9rem;color:var(--muted);margin:0 0 8px}.status{font-size:.92rem;color:var(--muted);margin:0}.live{color:var(--green);font-weight:700}.stale{color:#815e14;font-weight:700}.ended{color:var(--muted);font-weight:700}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.stat{border:1px solid var(--line);border-radius:12px;padding:10px}.stat strong{display:block;font-size:1.02rem}.stat span{font-size:.76rem;color:var(--muted)}
form{display:grid;gap:10px}label{font-size:.88rem;font-weight:650}input,textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;background:#fff;color:var(--fg)}textarea{min-height:76px;resize:vertical}button{justify-self:start;border:0;border-radius:999px;background:var(--green);color:white;font:650 .92rem Inter,system-ui,sans-serif;padding:11px 16px;cursor:pointer}button:disabled,input:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}.notice{font-size:.87rem;color:var(--muted);margin:0}.error{color:var(--red)}
.thread{display:grid;gap:9px;max-height:260px;overflow:auto}.message{border:1px solid var(--line);border-radius:12px;padding:9px 10px}.message.owner{background:#eef5ef}.message.viewer{background:#fff}.message strong{display:block;font-size:.78rem;margin-bottom:3px}.message p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.thread-empty{margin:0;color:var(--muted);font-size:.9rem}.live-position{background:transparent;border:0}.live-position span{display:block;width:18px;height:18px;border-radius:50%;background:var(--green);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)}.live-position.stale span{background:#a66d16}.leaflet-tooltip{font:600 .75rem Inter,system-ui,sans-serif}
@media(max-width:480px){.wrap{padding:12px}.stats{gap:7px}.stat{padding:8px}.stat strong{font-size:.9rem}}
</style></head><body>
<header><a class="brand" href="https://mapper.one">◎ mapper.one</a></header>
<main class="wrap"><div id="map" aria-label="Live activity map"><div class="empty-map" id="map-empty">Waiting for the first location update.</div><div class="map-legend" id="route-legend"><div class="legend-row"><i class="legend-line"></i><span>Recorded path</span></div><div class="legend-row planned-row" id="planned-legend"><i class="legend-line planned"></i><span id="planned-name">Followed trail</span></div></div></div>
<section class="card"><h1 id="name">Live activity</h1><p class="owner" id="owner">Recorder</p><p class="status" id="status">Loading activity status…</p><div class="stats"><div class="stat"><strong id="distance">—</strong><span>Distance</span></div><div class="stat"><strong id="duration">—</strong><span>Elapsed</span></div><div class="stat"><strong id="updated">—</strong><span>Last updated</span></div></div></section>
<section class="card" id="waypoint-update" hidden aria-live="polite"><strong id="waypoint-update-text"></strong></section>
<section class="card"><h2>Conversation</h2><div class="thread" id="message-thread" aria-live="polite"></div></section>
<section class="card"><form id="message-form"><label for="viewer-name">Your display name</label><input id="viewer-name" maxlength="80" autocomplete="name" placeholder="How should your messages be labeled?" required /><label for="message">Send the recorder a note</label><textarea id="message" maxlength="280" placeholder="Keep it short and practical." required></textarea><button id="send" type="submit">Send message</button><p class="notice" id="message-status">Your name is only a label for your messages, not an account. Messages are delivered in the mapper.one app when the recorder reconnects.</p></form></section>
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var token=${tokenJson}, api="/api/shared/live/"+encodeURIComponent(token), current=null;
   var $=function(id){return document.getElementById(id)}, empty=$("map-empty"), form=$("message-form"), box=$("message"), viewerName=$("viewer-name"), send=$("send"), thread=$("message-thread"), plannedLegend=$("planned-legend"), plannedName=$("planned-name");
   var map=null, route=null, plannedRoute=null, position=null, waypointLayer=null, fitted=false, lastPositionKey="",lastWaypointCount=0;
   try{viewerName.value=localStorage.getItem("mapper.one.live.viewer-name.v1")||""}catch(_e){}
  function distance(m){if(!Number.isFinite(m)||m<=0)return "—";return m<1000?Math.round(m)+" m":(m/1000).toFixed(m<10000?2:1)+" km"}
  function duration(ms){var s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+"h "+m+"m":m?m+"m":s+"s"}
  function ago(date){if(!date)return "No location yet";var seconds=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/1000));if(seconds<60)return "just now";var minutes=Math.floor(seconds/60);return minutes<60?minutes+" min ago":Math.floor(minutes/60)+"h ago"}
  function valid(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat>=-90&&p.lat<=90&&p.lng>=-180&&p.lng<=180}
  function ensureMap(){if(map)return true;if(!window.L)return false;map=L.map("map",{zoomControl:true,attributionControl:true});L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);map.setView([20,0],2);return true}
   function drawMap(data){if(!ensureMap()){empty.textContent="Map tiles could not load. Location updates are still shown below.";empty.style.display="grid";return}if(route){map.removeLayer(route);route=null}if(plannedRoute){map.removeLayer(plannedRoute);plannedRoute=null}if(position){map.removeLayer(position);position=null}if(waypointLayer){map.removeLayer(waypointLayer);waypointLayer=null}var points=(data.points||[]).filter(valid),followed=data.followedRoute&&Array.isArray(data.followedRoute.points)?data.followedRoute.points.filter(valid):[],waypoints=(data.waypoints||[]).filter(valid),last=valid(data.lastLocation)?data.lastLocation:points[points.length-1];waypointLayer=L.layerGroup().addTo(map);waypoints.forEach(function(w){var marker=L.marker([w.lat,w.lng]).addTo(waypointLayer),title=document.createElement("strong"),note=document.createElement("p"),popup=document.createElement("div");title.textContent=w.name||"Waypoint";popup.appendChild(title);if(w.notes){note.textContent=w.notes;popup.appendChild(note)}if(w.photoUrl){var image=document.createElement("img");image.src=w.photoUrl;image.alt=w.name||"Waypoint photo";image.style.cssText="display:block;max-width:220px;max-height:180px;margin-top:8px;border-radius:8px";popup.appendChild(image)}marker.bindPopup(popup)});plannedLegend.style.display=followed.length>1?"flex":"none";plannedName.textContent=data.followedRoute&&data.followedRoute.name?data.followedRoute.name:"Followed trail";if(followed.length>1){plannedRoute=L.polyline(followed.map(function(p){return [p.lat,p.lng]}),{color:"#315e43",weight:3,opacity:.58,dashArray:"8,8",lineJoin:"round",interactive:false}).addTo(map)}if(!points.length){empty.style.display="grid";if(!fitted&&plannedRoute){map.fitBounds(plannedRoute.getBounds(),{padding:[30,30],maxZoom:16});fitted=true}return}empty.style.display="none";var coords=points.map(function(p){return [p.lat,p.lng]});route=L.polyline(coords,{color:"#c8633a",weight:5,opacity:.94,lineJoin:"round"}).addTo(map);var stale=data.lastUpdatedAt&&Date.now()-new Date(data.lastUpdatedAt).getTime()>120000;if(last){var positionKey=last.lat+","+last.lng+","+last.t;position=L.marker([last.lat,last.lng],{icon:L.divIcon({className:"live-position "+(stale?"stale":""),html:"<span></span>",iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);position.bindTooltip(stale?"Last known location":"Live location",{direction:"top",offset:[0,-10]});if(!fitted){if(coords.length===1)map.setView(coords[0],15);else map.fitBounds(route.getBounds(),{padding:[30,30],maxZoom:16});fitted=true}else if(positionKey!==lastPositionKey){map.panTo([last.lat,last.lng],{animate:true,duration:.45})}lastPositionKey=positionKey}
  }
   function renderMessages(messages){thread.textContent="";if(!messages||!messages.length){var emptyThread=document.createElement("p");emptyThread.className="thread-empty";emptyThread.textContent="No messages yet.";thread.appendChild(emptyThread);return}messages.forEach(function(message){var item=document.createElement("article"),label=document.createElement("strong"),body=document.createElement("p");item.className="message "+(message.sender==="owner"?"owner":"viewer");label.textContent=message.sender==="owner"?(current.ownerDisplayName||"Recorder"):(message.displayName||"Viewer");body.textContent=message.body||"";item.appendChild(label);item.appendChild(body);thread.appendChild(item)})}
   function render(data){current=data;var count=(data.waypoints||[]).length,update=$("waypoint-update");if(lastWaypointCount&&count>lastWaypointCount){$("waypoint-update-text").textContent="New waypoint added: "+(data.waypoints[count-1].name||"Waypoint");update.hidden=false}else if(!count){update.hidden=true}lastWaypointCount=count;$("name").textContent=data.name;$("owner").textContent="Sharing as "+(data.ownerDisplayName||"Recorder");$("distance").textContent=distance(data.distanceMeters);$("duration").textContent=duration(data.durationMs);$("updated").textContent=ago(data.lastUpdatedAt);var stale=data.lastUpdatedAt&&Date.now()-new Date(data.lastUpdatedAt).getTime()>120000;
     var status=data.status==="completed"?"This activity has ended. This link is now view-only.":!data.lastUpdatedAt?"Waiting for the recorder's first location update.":stale?"Last known location shown — their device may be outside coverage.":"Live location is updating while the recorder has coverage.";
     $("status").textContent=status;$("status").className="status "+(data.status==="completed"?"ended":stale?"stale":"live");box.disabled=data.status!=="active";viewerName.disabled=data.status!=="active";send.disabled=data.status!=="active";if(data.status!=="active")$("message-status").textContent="This completed activity is view-only.";drawMap(data);renderMessages(data.messages||[]);
  }
  function load(){fetch(api,{cache:"no-store",headers:{Accept:"application/json"}}).then(function(r){if(!r.ok)throw new Error("unavailable");return r.json()}).then(render).catch(function(){$("status").textContent="This live activity is no longer available.";$("status").className="status error";box.disabled=true;send.disabled=true})}
   form.addEventListener("submit",function(e){e.preventDefault();var message=box.value.trim(),displayName=viewerName.value.trim();if(!current||current.status!=="active")return;if(!displayName){$("message-status").textContent="Enter a display name before sending.";viewerName.focus();return}if(!message)return;send.disabled=true;$("message-status").textContent="Sending…";fetch(api+"/messages",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({message:message,displayName:displayName})}).then(function(r){if(!r.ok)throw new Error("send");try{localStorage.setItem("mapper.one.live.viewer-name.v1",displayName)}catch(_e){}box.value="";$("message-status").textContent="Message sent to the recorder.";load()}).catch(function(){$("message-status").textContent="Could not send that message. Please try again."}).finally(function(){send.disabled=!current||current.status!=="active"})});
  load();setInterval(load,15000);
})();</script></body></html>`;
}

function shareCompletePage(
  projectId: string | null,
  sessionId: string | null,
  cancelled: boolean,
): string {
  const query = new URLSearchParams();
  if (projectId) query.set("projectId", projectId);
  if (sessionId) query.set("sessionId", sessionId);
  if (cancelled) query.set("cancelled", "1");
  const appLink = `${APP_SCHEME}://share-complete?${query.toString()}`;
  const heading = cancelled ? "Checkout cancelled" : "Return to mapper.one";
  const body = cancelled
    ? "No private project was activated. You can return to the app whenever you are ready."
    : "Your payment is being confirmed securely. Return to the app to get your private project link.";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow,noarchive" />
<title>${heading} · mapper.one</title>
<style>body{margin:0;font-family:'Inter',system-ui,sans-serif;background:hsl(40 20% 95%);color:hsl(20 10% 15%);display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px}.card{max-width:420px}h1{font-family:Georgia,serif;font-size:1.7rem;margin:0 0 10px}p{color:hsl(40 5% 45%);line-height:1.55;margin:0 0 20px}a{display:block;padding:13px 18px;border-radius:999px;background:hsl(135 18% 32%);color:hsl(40 20% 96%);font-weight:650;text-decoration:none}</style>
</head><body><main class="card"><h1>${heading}</h1><p>${body}</p><a href="${escapeHtml(appLink)}">Open mapper.one</a></main>
<script>setTimeout(function(){window.location.href=${JSON.stringify(appLink)}},120);</script></body></html>`;
}

function renderPage(opts: {
  name: string;
  description: string | null;
  color: string;
  distanceMeters: number;
  pointCount: number;
  visibility: string;
  coords: LatLng[];
  token: string;
  enhancedGuide?: { slug: string; title: string } | null;
}): string {
  const { name, description, color, distanceMeters, pointCount, visibility, coords, token, enhancedGuide } = opts;
  const isPublic = visibility === "public";
  const robots = isPublic ? "index,follow" : "noindex,nofollow";
  const title = `${name} · mapper.one`;
  const desc = description?.trim()
    ? description.trim()
    : `A ${formatDistance(distanceMeters)} route shared on mapper.one.`;
  const appLink = `${APP_SCHEME}://share/${token}`;
  // Safe to inline as JSON — coords are numbers only.
  const coordsJson = JSON.stringify(coords);
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#c8633a";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="${robots}" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta property="og:title" content="${escapeHtml(name)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:site_name" content="mapper.one" />
<link rel="preconnect" href="https://unpkg.com" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
  :root{--bg:hsl(40 20% 95%);--fg:hsl(20 10% 15%);--muted:hsl(40 5% 45%);
    --border:hsl(40 15% 85%);--card:hsl(40 20% 97%);--primary:hsl(135 18% 32%);
    --primary-fg:hsl(40 20% 96%)}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--fg);
    display:flex;flex-direction:column}
  header{padding:14px 18px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);
    background:var(--card)}
  header .brand{font-family:Georgia,serif;font-weight:700;font-size:1.05rem;color:var(--fg);
    text-decoration:none;display:flex;align-items:center;gap:6px}
  #map{flex:1;min-height:240px}
  .panel{padding:16px 18px;border-top:1px solid var(--border);background:var(--card)}
  h1{font-family:Georgia,serif;font-size:1.35rem;margin:0 0 4px}
  .meta{color:var(--muted);font-size:0.9rem;margin:0 0 4px}
  .desc{color:var(--fg);font-size:0.95rem;line-height:1.5;margin:8px 0 0;white-space:pre-wrap}
  .badge{display:inline-block;font-size:0.72rem;font-weight:600;text-transform:uppercase;
    letter-spacing:0.04em;padding:2px 8px;border-radius:999px;background:var(--bg);
    border:1px solid var(--border);color:var(--muted);vertical-align:middle;margin-left:8px}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
  .btn{flex:1 1 160px;text-align:center;padding:12px 16px;border-radius:999px;font-weight:600;
    font-size:0.95rem;text-decoration:none;cursor:pointer;border:1px solid var(--primary)}
  .btn.primary{background:var(--primary);color:var(--primary-fg)}
  .btn.ghost{background:transparent;color:var(--primary)}
  @media(min-width:720px){.panel{max-width:720px;margin:0 auto;width:100%}}
</style>
</head>
<body>
<header>
  <a class="brand" href="https://mapper.one">◎ mapper.one</a>
</header>
<div id="map"></div>
<div class="panel">
  <h1>${escapeHtml(name)}<span class="badge">${isPublic ? "Public" : "Shared link"}</span></h1>
  <p class="meta">${escapeHtml(formatDistance(distanceMeters))} · ${pointCount} points</p>
  ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ""}
  <div class="actions">
     ${isPublic && enhancedGuide ? `<a class="btn ghost" href="/trails/${encodeURIComponent(enhancedGuide.slug)}">★ Enhanced guide</a>` : ""}
    <a class="btn primary" href="${escapeHtml(appLink)}">Open in app</a>
    <a class="btn ghost" href="https://mapper.one">Get the app</a>
  </div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
  (function(){
    var coords = ${coordsJson};
    var color = ${JSON.stringify(safeColor)};
    var map = L.map('map', { zoomControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    if (coords.length > 0) {
      var line = L.polyline(coords, { color: color, weight: 4, opacity: 0.9 }).addTo(map);
      L.circleMarker(coords[0], { radius: 6, color: '#2f7d32', fillColor:'#2f7d32', fillOpacity:1 }).addTo(map);
      L.circleMarker(coords[coords.length-1], { radius: 6, color: '#b3261e', fillColor:'#b3261e', fillOpacity:1 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    } else {
      map.setView([20, 0], 2);
    }
  })();
</script>
</body></html>`;
}

router.get("/live/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token)
    ? req.params.token[0]
    : req.params.token;
  const token = typeof raw === "string" ? raw.trim() : "";

  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    res.status(404).type("html").send(notFoundPage());
    return;
  }
  const activity = await getPublicLiveActivity(token);
  if (!activity) {
    res.status(404).type("html").send(notFoundPage());
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.status(200).type("html").send(liveActivityPage(token));
});

router.get("/r/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token)
    ? req.params.token[0]
    : req.params.token;
  const token = typeof raw === "string" ? raw.trim() : "";

  const activity = await getPublicLiveActivity(token);
  if (!token) {
    res.status(404).type("html").send(notFoundPage());
    return;
  }

  const [row] = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.shareToken, token));

  if (!row) {
    res.status(404).type("html").send(notFoundPage());
    return;
  }

  const enhancedGuide = row.shareVisibility === "public"
    ? await findPublishedGuideForSource("public_track", row.id)
    : null;
  const html = renderPage({
    name: row.name,
    description: row.description,
    color: row.color,
    distanceMeters: row.distanceMeters,
    pointCount: row.pointCount,
    visibility: row.shareVisibility ?? "private",
    coords: pointsToLatLngs(row.points),
    token,
    enhancedGuide,
  });
  res.status(200).type("html").send(html);
});

router.get("/share-complete", async (req, res): Promise<void> => {
  const value = (name: string): string | null => {
    const raw = req.query[name];
    const first = Array.isArray(raw) ? raw[0] : raw;
    return typeof first === "string" && first.length > 0 ? first : null;
  };
  res
    .status(200)
    .type("html")
    .send(shareCompletePage(value("projectId"), value("session_id"), value("cancelled") === "1"));
});

// These files must be served without a redirect from the canonical HTTPS
// domain. The root AASA path is retained for older iOS versions; current iOS
// and Android clients use the .well-known paths.
router.get("/apple-app-site-association", sendAppleAppSiteAssociation);
router.get("/.well-known/apple-app-site-association", sendAppleAppSiteAssociation);
router.get("/.well-known/assetlinks.json", sendAndroidAssetLinks);

export default router;

function androidAssetLinks(): object[] {
  // Android requires the SHA-256 fingerprint of the release signing
  // certificate. Multiple fingerprints are supported for key rotation.
  return ANDROID_CERT_FINGERPRINTS.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: APP_BUNDLE_ID,
            sha256_cert_fingerprints: ANDROID_CERT_FINGERPRINTS,
          },
        },
      ]
    : [];
}

function appleAppSiteAssociation(): object {
  // iOS requires the Apple Developer Team ID as part of appID. Keep the
  // response valid but unclaimed until the production signing identity is
  // configured; a fabricated team ID would make every installed build fail
  // verification.
  return {
    applinks: {
      details: IOS_TEAM_ID
        ? [
            {
              appIDs: [`${IOS_TEAM_ID}.${APP_BUNDLE_ID}`],
              components: [{ "/": "/s/*" }, { "/": "/trails/*" }],
            },
          ]
        : [],
    },
  };
}

const IOS_TEAM_ID = process.env.IOS_TEAM_ID?.trim() || "";

function sendAppleAppSiteAssociation(_req: Request, res: Response): void {
  associationHeaders(res);
  res.status(200).send(JSON.stringify(appleAppSiteAssociation()));
}

function sendAndroidAssetLinks(_req: Request, res: Response): void {
  associationHeaders(res);
  res.status(200).send(JSON.stringify(androidAssetLinks()));
}

function associationHeaders(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
}

const ANDROID_CERT_FINGERPRINTS = (process.env.ANDROID_APP_LINK_CERT_SHA256
  ?.split(",")
  .map((fingerprint) => fingerprint.trim().toUpperCase())
  .filter(Boolean) ?? []);
