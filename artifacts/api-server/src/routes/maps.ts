import { Router, type IRouter, type Request } from "express";
import { asc, count, eq } from "drizzle-orm";
import { deflateSync } from "node:zlib";
import { communityDatasetsTable, db } from "@workspace/db";
import { escapeHtml, originFor, renderShell } from "../seo/ssrShared";
import { findPublishedGuideForSource } from "./trailGuides";
import {
  COMMUNITY_MAP_LABEL,
  publicCommunityMapGeoJson,
  publicCommunityMapMetadata,
  redactCommunityMapSourceText,
} from "../lib/communityMapSource";

const router: IRouter = Router();
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MAP_PADDING = 84;
const MAX_OG_DRAW_POINTS = 6_000;
const MAX_OG_MARKERS = 900;
const MAX_OG_RASTER_STEPS = 32_000;
const OG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OG_CACHE_MAX_ENTRIES = 160;
const ogImageCache = new Map<string, { expiresAt: number; image: Buffer }>();

type Position = [number, number];
type MapWaypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  photoUrl?: string | null;
};

type SharedRoute = {
  name: string;
  description: string | null;
  color: string;
  distanceMeters: number;
  pointCount: number;
  points: unknown;
};

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function finitePosition(value: unknown): Position | null {
  if (!Array.isArray(value)) return null;
  const [lng, lat] = value;
  return typeof lng === "number" && Number.isFinite(lng) && typeof lat === "number" && Number.isFinite(lat)
    ? [lng, lat]
    : null;
}

function positionsFromGeometry(geometry: unknown): Position[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const shape = geometry as {
    type?: unknown;
    coordinates?: unknown;
    geometries?: unknown;
  };
  const asLine = (values: unknown): Position[] =>
    Array.isArray(values)
      ? values.map(finitePosition).filter((point): point is Position => point !== null)
      : [];

  switch (shape.type) {
    case "Point": {
      const point = finitePosition(shape.coordinates);
      return point ? [[point]] : [];
    }
    case "MultiPoint":
      return Array.isArray(shape.coordinates)
        ? shape.coordinates
            .map(finitePosition)
            .filter((point): point is Position => point !== null)
            .map((point) => [point])
        : [];
    case "LineString":
      return [asLine(shape.coordinates)].filter((line) => line.length > 0);
    case "MultiLineString":
    case "Polygon":
      return Array.isArray(shape.coordinates)
        ? shape.coordinates
            .map(asLine)
            .filter((line) => line.length > 0)
        : [];
    case "MultiPolygon":
      return Array.isArray(shape.coordinates)
        ? shape.coordinates.flatMap((polygon) =>
            Array.isArray(polygon)
              ? polygon.map(asLine).filter((line) => line.length > 0)
              : [],
          )
        : [];
    case "GeometryCollection":
      return Array.isArray(shape.geometries)
        ? shape.geometries.flatMap(positionsFromGeometry)
        : [];
    default:
      return [];
  }
}

function positionsFromGeoJson(geojson: unknown): Position[][] {
  const collection = geojson as { features?: unknown[] };
  return Array.isArray(collection?.features)
    ? collection.features.flatMap((feature) =>
        positionsFromGeometry(
          feature && typeof feature === "object"
            ? (feature as { geometry?: unknown }).geometry
            : null,
        ),
      )
    : [];
}

function routePoints(points: unknown): Position[] {
  if (!Array.isArray(points)) return [];
  return points.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const { lng, lat } = point as { lng?: unknown; lat?: unknown };
    return typeof lng === "number" && Number.isFinite(lng) && typeof lat === "number" && Number.isFinite(lat)
      ? [[lng, lat] as Position]
      : [];
  });
}

function formatDistance(meters: number | null | undefined): string {
  if (!Number.isFinite(meters) || !meters || meters <= 0) return "—";
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`;
}

function formatElevation(meters: number | null | undefined): string {
  if (!Number.isFinite(meters) || meters === null || meters === undefined) return "—";
  return `${Math.round(meters)} m`;
}

function visibleDescription(description: string | null | undefined, fallback: string): string {
  const clean = description?.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 300) : fallback;
}

function featureDetails(geojson: unknown): Array<{ name: string; kind: string; note: string | null }> {
  const collection = geojson as { features?: unknown[] };
  if (!Array.isArray(collection?.features)) return [];
  return collection.features.slice(0, 12).map((feature, index) => {
    const record = feature as {
      geometry?: { type?: unknown };
      properties?: { name?: unknown; title?: unknown; description?: unknown; notes?: unknown };
    };
    const props = record?.properties ?? {};
    const note =
      typeof props.description === "string"
        ? props.description
        : typeof props.notes === "string"
          ? props.notes
          : null;
    return {
      name:
        typeof props.name === "string"
          ? props.name
          : typeof props.title === "string"
            ? props.title
            : `Map feature ${index + 1}`,
      kind: typeof record?.geometry?.type === "string" ? record.geometry.type : "Feature",
      note: note?.slice(0, 160) ?? null,
    };
  });
}

function mapViewerStyles(): string {
  return `<style>
    .map-page{padding:2.25rem 0 4.5rem}.map-page .map-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1.5rem;margin-bottom:1.5rem}.map-page h1{font-size:clamp(2.1rem,5vw,4rem);margin:.55rem 0 .75rem;max-width:18ch}.map-page .map-lead{font-size:1.08rem;line-height:1.7;color:var(--muted-foreground);max-width:48rem}.map-badges,.map-actions,.stat-grid{display:flex;flex-wrap:wrap;gap:.55rem}.map-badge{font-family:var(--font-mono);font-size:.7rem;letter-spacing:.07em;text-transform:uppercase;padding:.36rem .65rem;border:1px solid var(--border);border-radius:999px;color:var(--muted-foreground);background:var(--card)}.map-canvas{height:min(64vh,43rem);min-height:25rem;border:1px solid var(--border);border-radius:1.25rem;overflow:hidden;background:var(--muted);box-shadow:0 18px 46px -30px rgba(20,31,22,.45)}.map-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(18rem,.7fr);gap:1.25rem;margin-top:1.25rem}.map-panel{background:var(--card);border:1px solid var(--border);border-radius:1rem;padding:1.25rem}.map-panel h2{font-size:1.35rem;margin:0 0 .75rem}.map-panel p{font-size:.94rem;color:var(--muted-foreground);margin:.4rem 0}.stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.stat{padding:.85rem;background:color-mix(in srgb,var(--secondary) 32%,var(--card));border-radius:.75rem}.stat strong{display:block;font-family:var(--font-serif);font-size:1.5rem;line-height:1.1}.stat span{font-family:var(--font-mono);font-size:.65rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-foreground)}.map-actions{margin-top:1.25rem}.map-actions .btn{border:0;cursor:pointer}.feature-list{list-style:none;margin:0;padding:0}.feature-list li{padding:.8rem 0;border-top:1px solid color-mix(in srgb,var(--border) 65%,transparent)}.feature-list li:first-child{border-top:0}.feature-list strong{display:block;font-size:.95rem}.feature-list small{font-family:var(--font-mono);font-size:.66rem;text-transform:uppercase;color:var(--primary);letter-spacing:.06em}.feature-list p{margin:.2rem 0 0}.photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin-top:1.25rem}.photo-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.75rem;border:1px solid var(--border)}.map-private-note{border-left:3px solid var(--primary);padding:.75rem 1rem;background:color-mix(in srgb,var(--primary) 7%,var(--card));border-radius:.5rem;font-size:.9rem;color:var(--muted-foreground);margin-bottom:1rem}@media(max-width:760px){.map-page{padding-top:1.5rem}.map-page .map-head{display:block}.map-head .map-actions{margin-top:1rem}.map-layout{grid-template-columns:1fr}.map-canvas{height:55vh;min-height:22rem}.stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.stat{padding:.65rem}.stat strong{font-size:1.2rem}}@media(max-width:480px){.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">`;
}

function mapScript(mapData: unknown, showPublicTiles = true): string {
  return `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
  (function(){
    var mapData=${safeJson(mapData)};
    var map=L.map("shared-map",{zoomControl:true,scrollWheelZoom:false});
    var usePublicTiles=${showPublicTiles ? "true" : "false"};
    if(usePublicTiles){L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map)}
    else{map.getContainer().style.background="repeating-linear-gradient(0deg,rgba(68,105,80,.09) 0,rgba(68,105,80,.09) 1px,transparent 1px,transparent 52px),repeating-linear-gradient(90deg,rgba(68,105,80,.09) 0,rgba(68,105,80,.09) 1px,transparent 1px,transparent 52px),#edf1e9";map.attributionControl.setPrefix("")}
    var layer=L.geoJSON(mapData,{style:function(){return{color:"#406d52",weight:4,opacity:.92,fillColor:"#8fa987",fillOpacity:.2}},pointToLayer:function(_f,latlng){return L.circleMarker(latlng,{radius:6,color:"#2f6749",weight:2,fillColor:"#f8f4eb",fillOpacity:1})},onEachFeature:function(feature,layer){var p=feature&&feature.properties||{};var label=typeof p.name==="string"?p.name:(typeof p.title==="string"?p.title:"Map feature");if(label)layer.bindPopup(String(label).replace(/[<>&]/g,""))}}).addTo(map);
    if(layer.getBounds().isValid()){map.fitBounds(layer.getBounds(),{padding:[36,36]})}else{map.setView([20,0],2)}
    var copy=document.getElementById("copy-map-link");if(copy){copy.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(window.location.href);copy.textContent="Link copied";setTimeout(function(){copy.textContent="Copy link"},1600)})}
  })();
  </script>`;
}

function communityMapBody(dataset: {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  format: string;
  kind: string | null;
  featureCount: number;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  sizeBytes: number;
  region: string | null;
  geojson: unknown;
  isRedactedSource?: boolean;
}, enhancedGuide: { slug: string; title: string } | null): string {
  const mapData = publicCommunityMapGeoJson(dataset.geojson, Boolean(dataset.isRedactedSource));
  const features = featureDetails(mapData);
  const sourceLabel = dataset.author ? `Shared by ${dataset.author}` : "Shared with the mapper.one community";
  const description = visibleDescription(
    dataset.description,
    "A community map with routes, field features, and geometry ready to explore.",
  );
  return `${mapViewerStyles()}<article class="map-page"><div class="wrap">
    <div class="map-head"><div>
      <p class="eyebrow">Community map</p>
      <h1>${escapeHtml(dataset.name)}</h1>
      <p class="map-lead">${escapeHtml(description)}</p>
      <div class="map-badges" style="margin-top:1rem"><span class="map-badge">${escapeHtml(dataset.format)}</span>${dataset.kind ? `<span class="map-badge">${escapeHtml(dataset.kind)}</span>` : ""}${dataset.region ? `<span class="map-badge">${escapeHtml(dataset.region)}</span>` : ""}</div>
    </div><div class="map-actions">${enhancedGuide ? `<a class="btn" href="/trails/${encodeURIComponent(enhancedGuide.slug)}">★ Enhanced guide</a>` : ""}<a class="btn outline" href="/#community">Community maps</a><button class="btn" id="copy-map-link" type="button">Copy link</button></div></div>
    <div id="shared-map" class="map-canvas" role="application" aria-label="Interactive map for ${escapeHtml(dataset.name)}"></div>
    <div class="map-layout"><section class="map-panel"><h2>Map details</h2><div class="stat-grid">
      <div class="stat"><strong>${escapeHtml(formatDistance(dataset.distanceMeters))}</strong><span>Route distance</span></div>
      <div class="stat"><strong>${escapeHtml(formatElevation(dataset.elevationGainMeters))}</strong><span>Elevation gain</span></div>
      <div class="stat"><strong>${dataset.featureCount}</strong><span>Features</span></div>
      <div class="stat"><strong>${Math.max(1, Math.round(dataset.sizeBytes / 1024))} KB</strong><span>Data size</span></div>
    </div><div class="map-actions"><a class="btn" href="/api/community/datasets/${encodeURIComponent(dataset.id)}">Download GeoJSON</a><a class="btn outline" href="/#get-app">Open in mapper.one</a></div></section>
    <aside class="map-panel"><h2>About this map</h2><p>${escapeHtml(sourceLabel)}</p><p>${escapeHtml(dataset.region ? `Mapped in ${dataset.region}.` : "Use the interactive map to inspect the shared geometry.")}</p><p style="margin-top:1rem"><small class="muted">OpenStreetMap tiles © OpenStreetMap contributors</small></p></aside></div>
    ${features.length ? `<section class="map-panel" style="margin-top:1.25rem"><h2>Routes, points, and field features</h2><ul class="feature-list">${features.map((feature) => `<li><small>${escapeHtml(feature.kind)}</small><strong>${escapeHtml(feature.name)}</strong>${feature.note ? `<p>${escapeHtml(feature.note)}</p>` : ""}</li>`).join("")}</ul></section>` : ""}
  </div></article>${mapScript(mapData)}`;
}

function routeGeoJson(route: SharedRoute, waypoints: MapWaypoint[]): object {
  const points = routePoints(route.points);
  return {
    type: "FeatureCollection",
    features: [
      ...(points.length
        ? [{ type: "Feature", properties: { name: route.name, kind: "route" }, geometry: { type: "LineString", coordinates: points } }]
        : []),
      ...waypoints.map((waypoint) => ({
        type: "Feature",
        properties: { name: waypoint.name, notes: waypoint.notes ?? "" },
        geometry: { type: "Point", coordinates: [waypoint.longitude, waypoint.latitude] },
      })),
    ],
  };
}

export function renderPrivateProjectMapPage(
  req: Request,
  token: string,
  route: SharedRoute,
  waypoints: MapWaypoint[],
): string {
  const routeData = routeGeoJson(route, waypoints);
  const photos = waypoints.filter((waypoint) => waypoint.photoUrl);
  const body = `${mapViewerStyles()}<article class="map-page"><div class="wrap">
    <div class="map-head"><div><p class="eyebrow">Private project · view only</p><h1>${escapeHtml(route.name)}</h1><p class="map-lead">${escapeHtml(visibleDescription(route.description, "A shared field map with its route and marked locations."))}</p></div><div class="map-actions"><a class="btn outline" href="mobile://share/${encodeURIComponent(token)}?mode=private">Open in app</a><button class="btn" id="copy-map-link" type="button">Copy private link</button></div></div>
    <p class="map-private-note">This private project is visible only to people with this link. It is view-only, is not listed or indexed publicly, and uses a neutral map background so viewing it does not send its locations to an outside mapping provider.</p>
    <div id="shared-map" class="map-canvas" role="application" aria-label="Interactive private project map"></div>
    <div class="map-layout"><section class="map-panel"><h2>Project overview</h2><div class="stat-grid"><div class="stat"><strong>${escapeHtml(formatDistance(route.distanceMeters))}</strong><span>Route distance</span></div><div class="stat"><strong>${route.pointCount}</strong><span>Track points</span></div><div class="stat"><strong>${waypoints.length}</strong><span>Waypoints</span></div><div class="stat"><strong>View</strong><span>Access level</span></div></div></section>
    <aside class="map-panel"><h2>Marked locations</h2><ul class="feature-list">${waypoints.length ? waypoints.map((waypoint) => `<li><strong>${escapeHtml(waypoint.name)}</strong>${waypoint.notes ? `<p>${escapeHtml(waypoint.notes)}</p>` : ""}</li>`).join("") : "<li><p>No additional waypoints were shared with this route.</p></li>"}</ul></aside></div>
    ${photos.length ? `<section class="map-panel" style="margin-top:1.25rem"><h2>Field photos</h2><div class="photo-grid">${photos.map((waypoint) => `<figure><img src="${escapeHtml(waypoint.photoUrl ?? "")}" alt="${escapeHtml(`Photo for ${waypoint.name}`)}" loading="lazy"><figcaption class="muted" style="font-size:.8rem;margin-top:.35rem">${escapeHtml(waypoint.name)}</figcaption></figure>`).join("")}</div></section>` : ""}
  </div></article>${mapScript(routeData, false)}`;

  return renderShell({
    title: "Shared private project · mapper.one",
    description: "A view-only private mapper.one project.",
    canonical: `${originFor(req)}/s/${encodeURIComponent(token)}`,
    ogImage: `${originFor(req)}/opengraph.jpg`,
    robots: "noindex,nofollow,noarchive",
    body,
  });
}

router.get("/maps/:id", async (req, res): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const [dataset] = await db
    .select()
    .from(communityDatasetsTable)
    .where(eq(communityDatasetsTable.id, id))
    .limit(1);

  if (!dataset) {
    res.status(404).type("html").send(
      renderShell({
        title: "Community map not found · mapper.one",
        description: "This community map is not available.",
        canonical: `${originFor(req)}/maps/${encodeURIComponent(id)}`,
        ogImage: `${originFor(req)}/opengraph.jpg`,
        robots: "noindex,nofollow",
        body: `<section class="hero"><div class="wrap narrow"><p class="eyebrow">Community maps</p><h1>That map isn't available.</h1><p class="lead">It may have been removed or the link is incomplete.</p><div class="cta-row"><a class="btn" href="/#community">Browse community maps</a></div></div></section>`,
      }),
    );
    return;
  }

  const metadata = publicCommunityMapMetadata(dataset);
  const isRedactedSource = metadata.isCommunityMapSource;
  const publicDataset = {
    ...dataset,
    name: isRedactedSource
      ? redactCommunityMapSourceText(dataset.name) ?? COMMUNITY_MAP_LABEL
      : dataset.name,
    description: metadata.description,
    author: metadata.author,
    isRedactedSource,
  };
  const description = visibleDescription(
    publicDataset.description,
    `Explore ${publicDataset.name}, a mapper.one community map with shared route and field data.`,
  );
  const canonical = `${originFor(req)}/maps/${dataset.id}`;
  const schema = [{
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: publicDataset.name,
    description,
    url: canonical,
    creator: publicDataset.author ? { "@type": "Person", name: publicDataset.author } : undefined,
    spatialCoverage: dataset.region ? { "@type": "Place", name: dataset.region } : undefined,
    distribution: { "@type": "DataDownload", encodingFormat: "application/geo+json", contentUrl: `${originFor(req)}/api/community/datasets/${dataset.id}` },
  }];

  res.setHeader(
    "Cache-Control",
    process.env.NODE_ENV === "production"
      ? "public, max-age=900, stale-while-revalidate=86400"
      : "no-cache",
  );
  const enhancedGuide = await findPublishedGuideForSource("community_dataset", dataset.id);
  res.type("html").send(renderShell({
    title: `${publicDataset.name} community map · mapper.one`,
    description,
    canonical,
    ogImage: `${originFor(req)}/og/maps/${dataset.id}.png`,
    ogType: "article",
    schema,
    body: communityMapBody(publicDataset, enhancedGuide),
  }));
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

export function routePreviewPng(geojson: unknown): Buffer {
  const stride = OG_WIDTH * 3 + 1;
  const pixels = Buffer.alloc(stride * OG_HEIGHT);
  let rasterStepsRemaining = MAX_OG_RASTER_STEPS;
  let markerCount = 0;
  const setPixel = (x: number, y: number, color: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= OG_WIDTH || y >= OG_HEIGHT) return;
    const offset = y * stride + 1 + x * 3;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
  };
  const fill = (color: [number, number, number]) => {
    for (let y = 0; y < OG_HEIGHT; y++) {
      const start = y * stride;
      pixels[start] = 0;
      for (let x = 0; x < OG_WIDTH; x++) {
        const offset = start + 1 + x * 3;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
      }
    }
  };
  const line = (a: [number, number], b: [number, number], color: [number, number, number], width: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const fullSteps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const steps = Math.min(fullSteps, 400, rasterStepsRemaining);
    if (steps < 1) return;
    rasterStepsRemaining -= steps;
    const radius = Math.max(1, Math.floor(width / 2));
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(a[0] + (dx * step) / steps);
      const y = Math.round(a[1] + (dy * step) / steps);
      for (let ox = -radius; ox <= radius; ox++) {
        for (let oy = -radius; oy <= radius; oy++) {
          if (ox * ox + oy * oy <= radius * radius) setPixel(x + ox, y + oy, color);
        }
      }
    }
  };
  const dot = (point: [number, number], color: [number, number, number], radius: number) => {
    if (markerCount >= MAX_OG_MARKERS) return;
    markerCount++;
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        if (x * x + y * y <= radius * radius) setPixel(point[0] + x, point[1] + y, color);
      }
    }
  };

  fill([232, 237, 225]);
  for (let x = 0; x < OG_WIDTH; x += 80) line([x, 0], [x, OG_HEIGHT], [211, 221, 203], 1);
  for (let y = 0; y < OG_HEIGHT; y += 80) line([0, y], [OG_WIDTH, y], [211, 221, 203], 1);
  const routes = positionsFromGeoJson(geojson);
  let totalPoints = 0;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const route of routes) {
    for (const [lng, lat] of route) {
      totalPoints++;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (totalPoints) {
    const lngSpan = Math.max(maxLng - minLng, 0.0001);
    const latSpan = Math.max(maxLat - minLat, 0.0001);
    const scale = Math.min(
      (OG_WIDTH - MAP_PADDING * 2) / lngSpan,
      (OG_HEIGHT - MAP_PADDING * 2) / latSpan,
    );
    const project = ([lng, lat]: Position): [number, number] => [
      Math.round((OG_WIDTH - lngSpan * scale) / 2 + (lng - minLng) * scale),
      Math.round((OG_HEIGHT + latSpan * scale) / 2 - (lat - minLat) * scale),
    ];
    const samplingStep = Math.max(1, Math.ceil(totalPoints / MAX_OG_DRAW_POINTS));
    const preserveRouteEndpoints = routes.length <= MAX_OG_DRAW_POINTS / 4;
    let globalPointIndex = 0;
    for (const route of routes) {
      const sampled: Position[] = [];
      for (let index = 0; index < route.length; index++) {
        const isEndpoint = index === 0 || index === route.length - 1;
        if (globalPointIndex % samplingStep === 0 || (preserveRouteEndpoints && isEndpoint)) {
          sampled.push(route[index]);
        }
        globalPointIndex++;
      }
      const projected = sampled.map(project);
      for (let i = 1; i < projected.length; i++) line(projected[i - 1], projected[i], [53, 106, 76], 10);
      if (projected[0]) dot(projected[0], [32, 87, 58], 14);
      if (projected.length > 1 && projected.at(-1)) dot(projected.at(-1)!, [185, 103, 55], 14);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(OG_WIDTH, 0);
  header.writeUInt32BE(OG_HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

router.get("/og/maps/:id.png", async (req, res): Promise<void> => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const cached = ogImageCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.type("png").send(cached.image);
    return;
  }
  const [dataset] = await db
    .select({ geojson: communityDatasetsTable.geojson })
    .from(communityDatasetsTable)
    .where(eq(communityDatasetsTable.id, id))
    .limit(1);
  if (!dataset) {
    res.status(404).type("text/plain").send("Map not found");
    return;
  }
  const image = routePreviewPng(dataset.geojson);
  if (ogImageCache.size >= OG_CACHE_MAX_ENTRIES) {
    const firstKey = ogImageCache.keys().next().value;
    if (firstKey) ogImageCache.delete(firstKey);
  }
  ogImageCache.set(id, { expiresAt: Date.now() + OG_CACHE_TTL_MS, image });
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.type("png").send(image);
});

export async function publicMapSitemapEntries(
  options: { limit?: number; offset?: number } = {},
): Promise<Array<{ id: string; createdAt: Date }>> {
  const query = db
    .select({ id: communityDatasetsTable.id, createdAt: communityDatasetsTable.createdAt })
    .from(communityDatasetsTable)
    .orderBy(asc(communityDatasetsTable.createdAt));
  if (options.limit == null) return query;
  return query.limit(options.limit).offset(Math.max(0, options.offset ?? 0));
}

export async function publicMapSitemapCount(): Promise<number> {
  const [result] = await db
    .select({ total: count() })
    .from(communityDatasetsTable);
  return Number(result?.total ?? 0);
}

export default router;