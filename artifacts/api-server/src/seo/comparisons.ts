import { escapeHtml, renderShell, ctaBand, originFor } from "./ssrShared";
import type { Request } from "express";

/**
 * Data + page generators for the mapper.one comparison / "alternative" pages.
 *
 * Each competitor entry is hand-written from verified public pricing/feature
 * data (checked 2026) and deliberately stays honest: every page names what the
 * competitor genuinely does better than mapper.one. Fair comparisons earn trust
 * (and rank); thin "we win everything" pages do not. Pricing changes over time —
 * if it drifts, update the `pricing`/`rows` fields here.
 */

const OG_IMAGE_PATH = "/opengraph.jpg";

interface Row {
  feature: string;
  them: string;
  us: string;
}
interface Faq {
  q: string;
  a: string;
}
interface Competitor {
  /** URL slug, e.g. "avenza-maps-alternative". */
  slug: string;
  name: string;
  /** One-line positioning used on the hub cards. */
  blurb: string;
  /** <title> and H1. */
  h1: string;
  title: string;
  metaDescription: string;
  pricing: string;
  intro: string[];
  /** What the competitor genuinely does well (fair, no strawman). */
  strengths: string[];
  /** Where mapper.one differs / does better. */
  edge: string[];
  /** Honest: where the competitor still wins; who should stay. */
  stillWins: string;
  /** Who should switch to mapper.one. */
  switchIf: string;
  rows: Row[];
  faqs: Faq[];
}

/** mapper.one's own facts, reused across every page's comparison column. */
const US = "mapper.one";

const COMPETITORS: Competitor[] = [
  {
    slug: "avenza-maps-alternative",
    name: "Avenza Maps",
    blurb:
      "The georeferenced-PDF standard. See where a free, unlimited, open-source app fits.",
    h1: "A free, open-source Avenza Maps alternative",
    title: "Avenza Maps Alternative — Free & Open-Source | mapper.one",
    metaDescription:
      "Looking for an Avenza Maps alternative? mapper.one is a free, open-source, offline-first mobile map app with unlimited imports (KML, KMZ, GeoJSON, GPX) and no subscription.",
    pricing:
      "Avenza is free for 3 imported maps; Plus is $49.99/yr (20 maps) and Pro starts at $169.99/yr. mapper.one is free with unlimited imports.",
    intro: [
      "Avenza Maps is the app most field crews reach for when they have a georeferenced PDF or GeoTIFF to carry into the backcountry. It is genuinely good at that job. But the free tier caps you at three imported maps, and lifting that cap means a $49.99/yr Plus subscription (or $169.99/yr for Pro).",
      "mapper.one was built as a mobile-first replacement for exactly this workflow: import your own map data on your phone, cache it for offline use, and drop waypoints in the field — without a per-map limit and without a subscription. It is free and open-source.",
    ],
    strengths: [
      "Best-in-class support for georeferenced PDF and GeoTIFF map packs — the format most agencies and the Avenza Map Store distribute.",
      "A large Map Store catalog of ready-made topo and recreation maps you can buy and download.",
      "Mature Pro features: shapefile import, Bluetooth high-accuracy external GPS, and converting tracks to areas.",
      "Years of field use behind it across surveying, forestry, and SAR.",
    ],
    edge: [
      "Unlimited map imports on the free tier — no 3-map ceiling and no subscription to lift it.",
      "Imports KML, KMZ, GeoJSON, and GPX directly on the phone (no desktop conversion step).",
      "Offline OpenStreetMap tile caching so the basemap itself works with no signal, not just your overlays.",
      "Open-source and account-free — your data stays on your device.",
    ],
    stillWins:
      "Stay with Avenza if your workflow is built around georeferenced PDF/GeoTIFF map packs or the Avenza Map Store catalog, or if you need its Pro-only shapefile and Bluetooth-GPS support. mapper.one focuses on vector data (KML/GPX/GeoJSON) and OSM basemaps rather than raster PDF map packs.",
    switchIf:
      "Switch to mapper.one if you import your own KML, GPX, or GeoJSON, want unlimited maps without paying yearly, and need the basemap cached for true offline use.",
    rows: [
      { feature: "Price", them: "Free (3 maps); Plus $49.99/yr; Pro $169.99/yr", us: "Free" },
      { feature: "Imported map limit", them: "3 free / 20 on Plus", us: "Unlimited" },
      { feature: "Import formats", them: "Geo-PDF, GeoTIFF, KML (+shapefile on Pro)", us: "KML, KMZ, GeoJSON, GPX" },
      { feature: "Offline basemap tiles", them: "Your imported maps / Map Store", us: "OpenStreetMap, cached offline" },
      { feature: "Waypoints with notes & photos", them: "Yes", us: "Yes" },
      { feature: "Route follow + off-route alerts", them: "Limited", us: "Yes, with voice alerts" },
      { feature: "Account required", them: "Yes", us: "No" },
      { feature: "Open source", them: "No", us: "Yes" },
    ],
    faqs: [
      {
        q: "Is mapper.one really free?",
        a: "Yes. mapper.one is free and open-source, with no subscription and no per-map limit. Optional donations help fund development, but every feature is available to everyone.",
      },
      {
        q: "Can it open my Avenza KML or GPX files?",
        a: "Yes. You can import KML, KMZ, GeoJSON, and GPX directly on your phone. Georeferenced PDF/GeoTIFF map packs are an Avenza specialty that mapper.one does not import — it uses OpenStreetMap basemaps plus your vector data instead.",
      },
      {
        q: "Does it work with no cell service?",
        a: "Yes. Map tiles you have viewed are cached to durable device storage, so saved regions render fully offline — that is the core use case.",
      },
    ],
  },
  {
    slug: "onx-maps-alternative",
    name: "onX (Hunt / Backcountry / Offroad)",
    blurb:
      "Subscription-only with proprietary landowner data. Honest take on the free, open trade-offs.",
    h1: "A free, open-source onX alternative",
    title: "onX Alternative — Free Offline Maps & Your Own Data | mapper.one",
    metaDescription:
      "An onX alternative without the subscription: mapper.one is free, open-source, and offline-first. Import your own KML/GPX/GeoJSON and drop field waypoints — no yearly fee.",
    pricing:
      "onX is subscription-only: Hunt Premium is $34.99/yr (one state), Elite $99.99/yr (all states); Backcountry and Offroad are similarly priced, with only a free trial. mapper.one is free.",
    intro: [
      "onX (Hunt, Backcountry, and Offroad) is a polished, subscription-only app whose real moat is proprietary data: private/public landowner boundaries, parcel ownership, and hunting-unit layers you cannot easily get anywhere else. If that data is why you use onX, no free app fully replaces it — and we will say so plainly.",
      "But many people pay $34.99–$99.99 a year mostly for offline topo maps, GPS tracks, and waypoints. mapper.one does that part for free: offline OpenStreetMap tiles, your own imported datasets, and field waypoints, all open-source and account-optional.",
    ],
    strengths: [
      "Proprietary landowner and parcel-ownership data with public/private boundaries — its standout feature.",
      "Hunting-unit and game-management layers, plus high-resolution satellite imagery.",
      "Very polished, well-supported apps with offline downloads and routing.",
      "Specialized variants tuned for hunting, backcountry, and off-road use.",
    ],
    edge: [
      "Free and open-source — no subscription and no trial clock.",
      "Bring your own data: import KML, KMZ, GeoJSON, and GPX (including agency boundary files) on the phone.",
      "Offline OSM basemap caching for true no-signal use.",
      "Account-optional; your waypoints and tracks live on your device.",
    ],
    stillWins:
      "Stay with onX if you depend on its landowner/parcel data or hunting-unit layers — that proprietary dataset is the reason to pay, and mapper.one does not replicate it. You can sometimes import public boundary data yourself as GeoJSON, but it will not match onX's curated ownership layers.",
    switchIf:
      "Switch (or add mapper.one) if you mainly need offline topo, your own GPX/KML data, and waypoints, and would rather not pay a yearly subscription for it.",
    rows: [
      { feature: "Price", them: "$34.99–$99.99/yr (trial only)", us: "Free" },
      { feature: "Free tier", them: "Trial only", us: "Free forever" },
      { feature: "Landowner / parcel data", them: "Yes (proprietary)", us: "No" },
      { feature: "Hunting-unit layers", them: "Yes", us: "Via imported data" },
      { feature: "Custom data import", them: "Limited", us: "KML, KMZ, GeoJSON, GPX" },
      { feature: "Offline maps", them: "Yes", us: "Yes (OpenStreetMap)" },
      { feature: "Account required", them: "Yes", us: "No" },
      { feature: "Open source", them: "No", us: "Yes" },
    ],
    faqs: [
      {
        q: "Does mapper.one show property lines like onX?",
        a: "No. Private/public landowner and parcel boundaries are onX's proprietary data and are not built in. If you have public boundary data as GeoJSON or KML you can import it yourself, but it will not match onX's curated ownership layers.",
      },
      {
        q: "Is there a free tier, or just a trial?",
        a: "mapper.one is free forever — not a trial. Every feature is available without paying, and there is no subscription.",
      },
      {
        q: "Can I use it for hunting?",
        a: "Yes, for offline topo, GPS tracks, and waypoints. Just know it does not include onX's landowner or game-unit datasets — bring your own boundary files if you need them.",
      },
    ],
  },
  {
    slug: "gaia-gps-alternative",
    name: "Gaia GPS",
    blurb:
      "Deep premium layer catalog vs. free offline OSM and your own data.",
    h1: "A free, open-source Gaia GPS alternative",
    title: "Gaia GPS Alternative — Free & Offline-First | mapper.one",
    metaDescription:
      "A Gaia GPS alternative that is free and open-source. mapper.one gives you offline OpenStreetMap tiles, KML/KMZ/GeoJSON/GPX imports, and field waypoints with no Premium subscription.",
    pricing:
      "Gaia GPS has a limited free tier; Premium is about $39.99/yr (some accounts see $59.99) and the Outside+ bundle is $89.99/yr. mapper.one is free.",
    intro: [
      "Gaia GPS is a favorite for its enormous catalog of premium map layers — USGS and NatGeo quads, slope-angle shading, satellite, weather overlays — plus solid web-based route planning. That depth is real, and most of the best layers sit behind Premium (~$39.99/yr) or the Outside+ bundle ($89.99/yr).",
      "mapper.one takes a leaner, free path: offline OpenStreetMap tiles, your own imported datasets, and field waypoints, all open-source. If you live in Gaia's premium layer stack, mapper.one will feel simpler; if you mostly need offline maps plus your own data, it covers that for free.",
    ],
    strengths: [
      "A deep premium layer library: USGS/NatGeo topo, slope-angle, satellite, and weather overlays.",
      "Strong web-based route planning that syncs to mobile.",
      "Cross-platform with a long maturity track record.",
      "Good printing and large-area download tooling on Premium.",
    ],
    edge: [
      "Free and open-source — no Premium or Outside+ subscription.",
      "Offline OpenStreetMap caching with no paywall on the basemap.",
      "On-device import of KML, KMZ, GeoJSON, and GPX.",
      "Account-optional and privacy-respecting; data stays on the device.",
    ],
    stillWins:
      "Stay with Gaia GPS if you rely on its premium layer library — slope-angle shading, weather, NatGeo/USGS quads — or its web route planner. mapper.one uses OpenStreetMap basemaps and does not bundle that specialized layer catalog.",
    switchIf:
      "Switch if you primarily want offline maps plus your own GPX/KML/GeoJSON data and waypoints, and do not want to pay for a layer catalog you rarely use.",
    rows: [
      { feature: "Price", them: "Free (limited); Premium ~$39.99/yr; Outside+ $89.99/yr", us: "Free" },
      { feature: "Premium map layers (slope, weather, NatGeo)", them: "Yes (paid)", us: "OpenStreetMap basemap" },
      { feature: "Offline maps", them: "Premium", us: "Free" },
      { feature: "Custom data import", them: "Yes", us: "KML, KMZ, GeoJSON, GPX" },
      { feature: "Web route planner", them: "Yes", us: "On-device plotting" },
      { feature: "Account required", them: "Yes", us: "No" },
      { feature: "Open source", them: "No", us: "Yes" },
    ],
    faqs: [
      {
        q: "Does mapper.one have slope-angle or weather layers?",
        a: "No. Those specialized overlays are part of Gaia's Premium catalog. mapper.one uses OpenStreetMap basemaps plus any data you import yourself.",
      },
      {
        q: "Is offline mapping free?",
        a: "Yes. Offline tile caching is free in mapper.one. In Gaia GPS, offline downloads require Premium.",
      },
      {
        q: "Can I import my Gaia tracks?",
        a: "Yes — export them as GPX (or KML/GeoJSON) and import them directly on your phone.",
      },
    ],
  },
  {
    slug: "alltrails-alternative",
    name: "AllTrails",
    blurb:
      "A trail-discovery network vs. a bring-your-own-data field tool. Different jobs.",
    h1: "A free, open-source AllTrails alternative",
    title: "AllTrails Alternative — Free Offline Maps & Your Data | mapper.one",
    metaDescription:
      "An AllTrails alternative for people who carry their own maps: mapper.one is free, open-source, and offline-first with KML/GPX/GeoJSON imports and field waypoints — offline included.",
    pricing:
      "AllTrails is free to browse, but offline maps require AllTrails+ at $35.99/yr (Peak is $79.99/yr). mapper.one is free, and offline is included.",
    intro: [
      "AllTrails is excellent at one thing: discovering popular trails through a huge curated database of routes, reviews, and photos. If trail discovery is what you want, it is hard to beat — and we are not going to pretend otherwise. mapper.one is a different kind of tool and has no trail database or reviews.",
      "Where the two diverge is the field workflow. AllTrails puts offline maps behind AllTrails+ ($35.99/yr). mapper.one is built for people who bring their own data — SAR grids, survey boundaries, custom GPX — and need it offline for free, open-source, with waypoints you drop where you stand.",
    ],
    strengths: [
      "A massive curated trail database with community reviews, photos, and conditions.",
      "Friendly, consumer-grade trail discovery and turn-by-turn route following.",
      "Recorded activities and a social/community layer.",
      "Polished onboarding for casual day-hikers.",
    ],
    edge: [
      "Offline maps are free — no AllTrails+ required to download a region.",
      "Bring your own data: import KML, KMZ, GeoJSON, and GPX on the phone.",
      "Built for fieldwork (SAR, survey, trail maintenance), not just recreation.",
      "Free, open-source, and account-optional.",
    ],
    stillWins:
      "Stay with AllTrails if your goal is discovering established trails with reviews, ratings, and photos. mapper.one has no curated trail catalog or social reviews — it assumes you bring (or import) the data you need.",
    switchIf:
      "Switch if you load your own maps and datasets, work fully offline, or do field/professional mapping, and do not want to pay for offline access.",
    rows: [
      { feature: "Price", them: "Free; AllTrails+ $35.99/yr; Peak $79.99/yr", us: "Free" },
      { feature: "Offline maps", them: "Paid (AllTrails+)", us: "Free" },
      { feature: "Curated trail database & reviews", them: "Yes", us: "No" },
      { feature: "Custom data import", them: "Limited", us: "KML, KMZ, GeoJSON, GPX" },
      { feature: "Field waypoints with notes/photos", them: "Limited", us: "Yes" },
      { feature: "Account required", them: "Yes", us: "No" },
      { feature: "Open source", them: "No", us: "Yes" },
    ],
    faqs: [
      {
        q: "Does mapper.one have a trail database like AllTrails?",
        a: "No. AllTrails' curated trails, reviews, and photos are its core product. mapper.one is a bring-your-own-data field app — import GPX/KML/GeoJSON or browse community-shared datasets instead.",
      },
      {
        q: "Are offline maps free?",
        a: "Yes. Offline tile caching is free in mapper.one. In AllTrails, downloading maps for offline use requires AllTrails+.",
      },
      {
        q: "Can I import an AllTrails route?",
        a: "Yes — export it as GPX and import it directly on your phone, then cache the area for offline use.",
      },
    ],
  },
  {
    slug: "caltopo-alternative",
    name: "CalTopo",
    blurb:
      "The desktop/SAR planning powerhouse vs. a free phone-first field companion.",
    h1: "A free, open-source CalTopo alternative",
    title: "CalTopo Alternative — Free Phone-First Field Maps | mapper.one",
    metaDescription:
      "A CalTopo alternative for the field: mapper.one is a free, open-source, offline-first mobile app. Carry your exported GeoJSON/GPX offline with waypoints — no subscription.",
    pricing:
      "CalTopo's desktop planner is free; the mobile app and advanced features are tiered — Mobile $20/yr, Pro $50/yr, Desktop $100/yr. mapper.one is free.",
    intro: [
      "CalTopo is the gold standard for serious desktop route planning, large-format printing, advanced layer analysis, and team/SAR coordination. Nothing here will tell you to give that up — its planning suite outclasses a phone app, and that is by design.",
      "mapper.one is the field companion to that kind of planning: a free, open-source, phone-first app for carrying your exported GeoJSON/GPX offline, dropping waypoints, and following routes — without paying for the mobile tier. Many users plan in CalTopo and carry mapper.one in the field.",
    ],
    strengths: [
      "Best-in-class desktop route planning and large-format map printing.",
      "Advanced analysis layers (slope, viewshed, fire/weather) and custom map stacks.",
      "Strong team and SAR coordination features and shared maps.",
      "A capable free desktop tier for planning.",
    ],
    edge: [
      "Free on mobile — no $20–$100/yr tier to use it in the field.",
      "Offline OpenStreetMap caching plus on-device import of KML, KMZ, GeoJSON, and GPX.",
      "Fast, simple field workflow: waypoints with notes/photos and off-route voice alerts.",
      "Open-source and account-optional.",
    ],
    stillWins:
      "Stay with CalTopo (and keep using it) for desktop planning, printing, advanced analysis layers, and SAR team coordination. mapper.one does not try to be a desktop planning suite — it is the in-field, phone-first half of that workflow.",
    switchIf:
      "Use mapper.one as your free field app if you want to carry CalTopo-exported GeoJSON/GPX offline with waypoints, without paying for the mobile subscription tier.",
    rows: [
      { feature: "Price", them: "Free desktop; Mobile $20/yr; Pro $50/yr; Desktop $100/yr", us: "Free" },
      { feature: "Desktop route planning & printing", them: "Yes (advanced)", us: "No (field-focused)" },
      { feature: "Mobile offline maps", them: "Paid tier", us: "Free" },
      { feature: "Custom data import", them: "Yes", us: "KML, KMZ, GeoJSON, GPX" },
      { feature: "Field waypoints + off-route alerts", them: "Yes", us: "Yes" },
      { feature: "Account required", them: "Yes", us: "No" },
      { feature: "Open source", them: "No", us: "Yes" },
    ],
    faqs: [
      {
        q: "Does mapper.one replace CalTopo's desktop planner?",
        a: "No. CalTopo's desktop planning, printing, and analysis tools are more powerful. mapper.one is the free phone-first field companion — plan in CalTopo, carry mapper.one in the field.",
      },
      {
        q: "Can I carry my CalTopo maps offline for free?",
        a: "Yes. Export your data as GeoJSON or GPX, import it on the phone, and cache the area — offline use is free in mapper.one.",
      },
      {
        q: "Is it suitable for SAR?",
        a: "For in-field navigation and waypoint capture, yes. For team coordination and advanced planning, CalTopo remains the stronger tool.",
      },
    ],
  },
];

const BY_SLUG = new Map(COMPETITORS.map((c) => [c.slug, c]));

const ROUNDUP_SLUG = "best-free-offline-trail-map-apps";

/** Render a comparison table from rows, with the competitor name as a header. */
function renderTable(themName: string, rows: Row[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td class="feat">${escapeHtml(r.feature)}</td><td>${escapeHtml(
          r.them,
        )}</td><td class="us">${escapeHtml(r.us)}</td></tr>`,
    )
    .join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>Feature</th><th>${escapeHtml(themName)}</th><th>mapper.one</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function renderList(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function breadcrumb(items: { name: string; href: string }[]): string {
  const html = items
    .map((it, i) =>
      i === items.length - 1
        ? `<span>${escapeHtml(it.name)}</span>`
        : `<a href="${it.href}">${escapeHtml(it.name)}</a> / `,
    )
    .join("");
  return `<div class="wrap"><nav class="crumbs">${html}</nav></div>`;
}

function breadcrumbSchema(
  origin: string,
  items: { name: string; href: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${origin}${it.href}`,
    })),
  };
}

function faqSchema(faqs: Faq[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Build a single competitor comparison page, or null if the slug is unknown. */
export function getComparisonHtml(req: Request, slug: string): string | null {
  const c = BY_SLUG.get(slug);
  if (!c) return null;
  const origin = originFor(req);
  const canonical = `${origin}/compare/${c.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Compare", href: "/compare" },
    { name: c.name, href: `/compare/${c.slug}` },
  ];

  const faqHtml = c.faqs
    .map(
      (f) =>
        `<div class="faq"><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(
          f.a,
        )}</p></div>`,
    )
    .join("");

  const siblings = COMPETITORS.filter((o) => o.slug !== c.slug)
    .map(
      (o) =>
        `<a class="card" href="/compare/${o.slug}"><h3>vs ${escapeHtml(
          o.name,
        )}</h3><p>${escapeHtml(o.blurb)}</p><span class="go">Read comparison →</span></a>`,
    )
    .join("");

  const body = `
${breadcrumb(crumbs)}
<section class="hero"><div class="wrap narrow">
  <p class="eyebrow">${escapeHtml(c.name)} alternative</p>
  <h1>${escapeHtml(c.h1)}</h1>
  <p class="lead">${escapeHtml(c.intro[0] ?? "")}</p>
  <div class="cta-row">
    <a class="btn" href="/#get-app">Get the mobile app</a>
    <a class="btn outline" href="/compare">See all comparisons</a>
  </div>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>${escapeHtml(c.name)} vs mapper.one at a glance</h2>
  <p>${escapeHtml(c.pricing)}</p>
  ${renderTable(c.name, c.rows)}
  <p class="muted" style="font-size:.85rem">Pricing reflects publicly listed rates and can change; check each vendor for current pricing.</p>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>Why people look for an alternative</h2>
  ${c.intro
    .slice(1)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("")}
  <div class="cols">
    <div class="panel"><h3>What ${escapeHtml(c.name)} does well</h3>${renderList(
      c.strengths,
    )}</div>
    <div class="panel win"><h3>Where mapper.one is different</h3>${renderList(
      c.edge,
    )}</div>
  </div>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>Which should you use?</h2>
  <h3>Where ${escapeHtml(c.name)} still wins</h3>
  <p>${escapeHtml(c.stillWins)}</p>
  <h3>When to choose mapper.one</h3>
  <p>${escapeHtml(c.switchIf)}</p>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>Frequently asked questions</h2>
  ${faqHtml}
</div></section>

<section class="block"><div class="wrap">
  <p class="eyebrow">More comparisons</p>
  <div class="cards">${siblings}</div>
</div></section>

${ctaBand(
  "Trustworthy maps for the wild places",
  "mapper.one is free, open-source, and built to work where there is no signal. Carry your own data into the field.",
)}
`;

  return renderShell({
    title: c.title,
    description: c.metaDescription,
    canonical,
    ogImage: `${origin}${OG_IMAGE_PATH}`,
    activeNav: "/compare",
    schema: [
      breadcrumbSchema(origin, crumbs),
      faqSchema(c.faqs),
    ],
    body,
  });
}

/** Master comparison matrix across all apps (used on hub + roundup). */
function masterMatrix(): string {
  const apps = [
    { name: "mapper.one", price: "Free", offline: "Free", free: "Free forever", imports: "KML/KMZ/GeoJSON/GPX", oss: "Yes" },
    { name: "Avenza Maps", price: "$49.99/yr (Plus)", offline: "Your maps", free: "3 maps", imports: "Geo-PDF/GeoTIFF/KML", oss: "No" },
    { name: "onX", price: "$34.99–$99.99/yr", offline: "Paid", free: "Trial only", imports: "Limited", oss: "No" },
    { name: "Gaia GPS", price: "~$39.99/yr", offline: "Premium", free: "Limited", imports: "Yes", oss: "No" },
    { name: "AllTrails", price: "$35.99/yr (+)", offline: "Paid", free: "No offline", imports: "Limited", oss: "No" },
    { name: "CalTopo", price: "$20–$100/yr", offline: "Paid (mobile)", free: "Desktop only", imports: "Yes", oss: "No" },
  ];
  const rows = apps
    .map((a) => {
      const isUs = a.name === "mapper.one";
      const cls = isUs ? ' class="us"' : "";
      const nm = isUs
        ? `<td class="feat us">${a.name}</td>`
        : `<td class="feat"><a href="/compare/${
            BY_SLUG.has(slugForName(a.name)) ? slugForName(a.name) : ""
          }">${escapeHtml(a.name)}</a></td>`;
      return `<tr>${nm}<td${cls}>${escapeHtml(a.price)}</td><td${cls}>${escapeHtml(
        a.free,
      )}</td><td${cls}>${escapeHtml(a.offline)}</td><td${cls}>${escapeHtml(
        a.imports,
      )}</td><td${cls}>${escapeHtml(a.oss)}</td></tr>`;
    })
    .join("");
  return `<div class="tablewrap"><table>
    <thead><tr><th>App</th><th>Paid plan</th><th>Free tier</th><th>Offline maps</th><th>Custom import</th><th>Open source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function slugForName(name: string): string {
  const map: Record<string, string> = {
    "Avenza Maps": "avenza-maps-alternative",
    onX: "onx-maps-alternative",
    "Gaia GPS": "gaia-gps-alternative",
    AllTrails: "alltrails-alternative",
    CalTopo: "caltopo-alternative",
  };
  return map[name] ?? "";
}

/** The /compare hub: intro, the master matrix, and links to every page. */
export function getHubHtml(req: Request): string {
  const origin = originFor(req);
  const canonical = `${origin}/compare`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Compare", href: "/compare" },
  ];
  const cards = COMPETITORS.map(
    (c) =>
      `<a class="card" href="/compare/${c.slug}"><h3>vs ${escapeHtml(
        c.name,
      )}</h3><p>${escapeHtml(c.blurb)}</p><span class="go">Read comparison →</span></a>`,
  ).join("");

  const body = `
${breadcrumb(crumbs)}
<section class="hero"><div class="wrap narrow">
  <p class="eyebrow">Compare mapping apps</p>
  <h1>mapper.one vs the paid mapping apps</h1>
  <p class="lead">Honest, side-by-side comparisons of mapper.one against Avenza Maps, onX, Gaia GPS, AllTrails, and CalTopo — including where each paid app still wins. mapper.one is free, open-source, and offline-first.</p>
  <div class="cta-row">
    <a class="btn" href="/#get-app">Get the mobile app</a>
    <a class="btn outline" href="/compare/${ROUNDUP_SLUG}">Best free offline map apps →</a>
  </div>
</div></section>

<section class="block"><div class="wrap">
  <h2>The quick matrix</h2>
  <p class="muted">Free tier, offline access, custom data import, and licensing across the popular options.</p>
  ${masterMatrix()}
  <p class="muted" style="font-size:.85rem">Pricing reflects publicly listed rates (checked 2026) and can change; verify with each vendor.</p>
</div></section>

<section class="block"><div class="wrap">
  <h2>Head-to-head comparisons</h2>
  <div class="cards">${cards}</div>
</div></section>

${ctaBand(
  "Free, offline, and open for the wild places",
  "No subscription, no account required. Import your own maps and carry them where there is no signal.",
)}
`;

  return renderShell({
    title: "mapper.one vs Avenza, onX, Gaia GPS, AllTrails & CalTopo",
    description:
      "Honest comparisons of mapper.one — a free, open-source, offline-first map app — against Avenza Maps, onX, Gaia GPS, AllTrails, and CalTopo.",
    canonical,
    ogImage: `${origin}${OG_IMAGE_PATH}`,
    activeNav: "/compare",
    schema: [breadcrumbSchema(origin, crumbs)],
    body,
  });
}

/** The "best free offline trail map apps" roundup listicle. */
export function getRoundupHtml(req: Request): string {
  const origin = originFor(req);
  const canonical = `${origin}/compare/${ROUNDUP_SLUG}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Compare", href: "/compare" },
    { name: "Best free offline trail map apps", href: `/compare/${ROUNDUP_SLUG}` },
  ];

  const picks: { name: string; href: string | null; verdict: string }[] = [
    {
      name: "mapper.one — best for free, offline, bring-your-own-data",
      href: null,
      verdict:
        "Free and open-source, with offline OpenStreetMap caching, on-device KML/KMZ/GeoJSON/GPX import, and field waypoints. No subscription and no account. The trade-off: no proprietary layers (landowner data, slope-angle) and no curated trail database — you bring the data.",
    },
    {
      name: "CalTopo — best for desktop planning that you carry offline",
      href: "/compare/caltopo-alternative",
      verdict:
        "Unmatched desktop planning, printing, and SAR coordination. The mobile/offline tiers are paid ($20–$100/yr). Many people plan in CalTopo and carry a free field app like mapper.one.",
    },
    {
      name: "Gaia GPS — best premium layer catalog",
      href: "/compare/gaia-gps-alternative",
      verdict:
        "Deep premium layers (slope-angle, weather, NatGeo/USGS). Offline downloads require Premium (~$39.99/yr). Worth it if you live in those layers.",
    },
    {
      name: "onX — best for landowner & hunting-unit data",
      href: "/compare/onx-maps-alternative",
      verdict:
        "Proprietary parcel/landowner boundaries and hunting layers no free app replicates. Subscription-only ($34.99–$99.99/yr), with a trial rather than a free tier.",
    },
    {
      name: "AllTrails — best for discovering popular trails",
      href: "/compare/alltrails-alternative",
      verdict:
        "Huge curated trail database with reviews and photos. Offline maps require AllTrails+ ($35.99/yr). Great for discovery, less for bring-your-own-data fieldwork.",
    },
    {
      name: "Avenza Maps — best for georeferenced PDF map packs",
      href: "/compare/avenza-maps-alternative",
      verdict:
        "The standard for geo-PDF/GeoTIFF maps and the Avenza Map Store. Free tier caps at 3 maps; Plus is $49.99/yr. Ideal if your maps arrive as georeferenced PDFs.",
    },
  ];

  const items = picks
    .map((p, i) => {
      const link = p.href
        ? `<a class="go" href="${p.href}">Full comparison →</a>`
        : `<a class="go" href="/#get-app">Get the app →</a>`;
      return `<div class="panel" style="margin-bottom:1rem">
        <h3>${i + 1}. ${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.verdict)}</p>
        ${link}
      </div>`;
    })
    .join("");

  const body = `
${breadcrumb(crumbs)}
<section class="hero"><div class="wrap narrow">
  <p class="eyebrow">Buyer's guide</p>
  <h1>The best free offline trail map apps</h1>
  <p class="lead">Which mapping apps actually work with no cell service — and which charge for offline. An honest, no-hype rundown for hikers, hunters, surveyors, and SAR teams who can't afford their maps to fail.</p>
  <div class="cta-row">
    <a class="btn" href="/#get-app">Get the mobile app</a>
    <a class="btn outline" href="/compare">All comparisons</a>
  </div>
</div></section>

<section class="block"><div class="wrap">
  <h2>How they compare</h2>
  ${masterMatrix()}
  <p class="muted" style="font-size:.85rem">Pricing reflects publicly listed rates (checked 2026) and can change; verify with each vendor.</p>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>What "offline" really means in the field</h2>
  <p>"Offline" gets used loosely. The question that matters in the backcountry is whether the basemap tiles render with the radio off, not just whether your saved routes show up. Several popular apps let you view routes offline but put offline basemap downloads behind a paid tier.</p>
  <p>mapper.one caches OpenStreetMap tiles to durable on-device storage, so any area you viewed before leaving the trailhead is available with no signal — for free. The honest trade-off is that mapper.one does not bundle proprietary layers (slope-angle shading, landowner parcels, curated trail databases); it leans on OpenStreetMap plus the data you import.</p>
</div></section>

<section class="block"><div class="wrap narrow">
  <h2>The rundown</h2>
  ${items}
</div></section>

${ctaBand(
  "Start mapping for free",
  "mapper.one is free, open-source, and offline-first. Bring your own data and head out — no subscription, no account.",
)}
`;

  return renderShell({
    title: "Best Free Offline Trail Map Apps (2026) | mapper.one",
    description:
      "The best free offline trail map apps compared — which work with no signal and which charge for offline. Honest picks for hikers, hunters, surveyors, and SAR.",
    canonical,
    ogImage: `${origin}${OG_IMAGE_PATH}`,
    activeNav: "/compare",
    schema: [
      breadcrumbSchema(origin, crumbs),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: picks.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.name,
        })),
      },
    ],
    body,
  });
}

/** Roundup slug, exported for routing. */
export const ROUNDUP_PATH_SLUG = ROUNDUP_SLUG;

/** All canonical SEO paths, for sitemap.xml generation. */
export function allSeoPaths(): string[] {
  return [
    "/compare",
    `/compare/${ROUNDUP_SLUG}`,
    ...COMPETITORS.map((c) => `/compare/${c.slug}`),
  ];
}

export { US };
