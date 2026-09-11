import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, fieldProjectReportLinksTable, fieldProjectsTable } from "@workspace/db";
import { escapeHtml } from "../seo/ssrShared";

const router: IRouter = Router();

router.get("/report/:token", async (req, res): Promise<void> => {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const [result] = await db
    .select({ name: fieldProjectsTable.name, description: fieldProjectsTable.description })
    .from(fieldProjectReportLinksTable)
    .innerJoin(fieldProjectsTable, eq(fieldProjectReportLinksTable.projectId, fieldProjectsTable.id))
    .where(and(eq(fieldProjectReportLinksTable.token, token), eq(fieldProjectReportLinksTable.active, true)))
    .limit(1);
  if (!result) {
    res.status(404).set("Cache-Control", "private, no-store").send("<!doctype html><title>Reporting link unavailable</title><p>This reporting link is unavailable.</p>");
    return;
  }
  const safeToken = JSON.stringify(token);
  res
    .set("Cache-Control", "private, no-store")
    .set("X-Robots-Tag", "noindex, nofollow")
    .type("html")
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report an issue · ${escapeHtml(result.name)}</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#1c2620;background:#faf6ef}body{margin:0}.wrap{max-width:680px;margin:auto;padding:32px 18px 56px}h1{font-size:clamp(2rem,6vw,3.5rem);margin:8px 0}.eyebrow{color:#2f6b46;font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:.76rem}p{line-height:1.55;color:#584f42}.card{background:white;border:1px solid #ddd2bb;border-radius:18px;padding:20px;margin-top:22px;box-shadow:0 8px 26px #513e1d10}label{display:block;font-weight:700;margin:16px 0 6px}input,textarea,select,button{font:inherit;box-sizing:border-box}input,textarea,select{width:100%;border:1px solid #cfc3aa;border-radius:10px;padding:12px;background:#fff}textarea{min-height:120px;resize:vertical}#map{height:255px;border-radius:12px;overflow:hidden;margin:12px 0;border:1px solid #ddd2bb}button{background:#2f6b46;color:white;border:0;border-radius:10px;padding:13px 17px;font-weight:800;cursor:pointer;margin-top:20px}button[disabled]{opacity:.6}.hint,#message{font-size:.9rem;color:#6b6253}.success{color:#1e693c!important;font-weight:700}@media(max-width:520px){.wrap{padding-top:24px}.card{padding:16px}}</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script></head>
<body><main class="wrap"><div class="eyebrow">Community field report</div><h1>${escapeHtml(result.name)}</h1><p>${escapeHtml(result.description || "Help the project team spot and resolve an issue. Your report will be reviewed privately.")}</p>
<form id="form" class="card"><label for="title">Short title <span class="hint">(optional)</span></label><input id="title" maxlength="160" placeholder="e.g. Fallen tree across path">
<label for="category">Category</label><select id="category"><option value="">Choose a category</option><option>Trail obstruction</option><option>Safety concern</option><option>Damage</option><option>Maintenance</option><option>Other</option></select>
<label for="description">What did you find?</label><textarea id="description" maxlength="5000" required placeholder="Include useful details for the field team."></textarea>
<label>Pin the location</label><div id="map"></div><div class="hint">Tap the map to adjust the pin. Location sharing is optional.</div>
<label for="photo">Photo <span class="hint">(optional)</span></label><input id="photo" type="file" accept="image/*"><input id="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-10000px">
<button id="submit" type="submit">Send report</button><p id="message" aria-live="polite"></p></form></main>
<script>
const token=${safeToken}, map=L.map('map').setView([35.6,-82.55],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
let point={latitude:35.6,longitude:-82.55}, marker=L.marker([point.latitude,point.longitude],{draggable:true}).addTo(map);
function setPoint(latlng){point={latitude:latlng.lat,longitude:latlng.lng};marker.setLatLng(latlng)} map.on('click',e=>setPoint(e.latlng));marker.on('dragend',()=>setPoint(marker.getLatLng()));
if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>{const latlng=L.latLng(p.coords.latitude,p.coords.longitude);map.setView(latlng,16);setPoint(latlng)},{enableHighAccuracy:true,timeout:8000});
async function uploadPhoto(file){const prep=await fetch('/api/public-reports/'+encodeURIComponent(token)+'/photos/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,contentType:file.type})});if(!prep.ok)throw new Error('Could not prepare photo');const data=await prep.json();const put=await fetch(data.uploadURL,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!put.ok)throw new Error('Could not upload photo');return data.objectPath}
document.getElementById('form').addEventListener('submit',async e=>{e.preventDefault();const b=document.getElementById('submit'),m=document.getElementById('message');b.disabled=true;m.textContent='Sending…';try{const file=document.getElementById('photo').files[0],photoPaths=file?[await uploadPhoto(file)]:[];const r=await fetch('/api/public-reports/'+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.getElementById('title').value||null,category:document.getElementById('category').value||null,description:document.getElementById('description').value,latitude:point.latitude,longitude:point.longitude,photoPaths,antiSpam:document.getElementById('website').value})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not send report');m.textContent=data.message;m.className='success';e.target.reset()}catch(err){m.textContent=err.message||'Could not send report'}finally{b.disabled=false}})</script></body></html>`);
});

export default router;