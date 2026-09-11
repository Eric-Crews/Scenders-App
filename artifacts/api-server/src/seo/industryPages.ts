import type { Request } from "express";
import { ctaBand, escapeHtml, originFor, renderShell } from "./ssrShared";

export const INDUSTRY_SLUGS = [
  "arborists",
  "trail-builders",
  "landscaping",
  "landscape-architecture",
  "forestry",
  "land-management",
  "tour-operators",
  "property-management",
] as const;

export const PROPERTY_MANAGEMENT_PATH = "/industries/property-management";

type IconName = "walk" | "pin" | "camera" | "share";
type IndustryPage = {
  slug: (typeof INDUSTRY_SLUGS)[number];
  label: string;
  title: string;
  description: string;
  sectionTitle: string;
  sectionLead: string;
  workflow: Array<{ icon: IconName; title: string; copy: string }>;
  audienceTitle: string;
  audienceLead: string;
  audiences: string[];
  closingTitle: string;
  closingCopy: string;
  imageAlt: string;
  visualLabels: [string, string];
};

const ICONS: Record<IconName, string> = {
  walk: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4.5a2 2 0 1 0-2-2 2 2 0 0 0 2 2ZM9.5 22l1.2-6.2 2.1 2v4.2M8 13.5l2.4-2.3 1.7-3.4 2.7 1.5 1.4 3.2M7.2 10.7l-2.4 2.4-1.7 3.2M15.1 11l2.5 1.2 1.7 2.8"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4v-11Z"/><circle cx="12" cy="13" r="3.2"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5"/></svg>`,
};

const INDUSTRIES: IndustryPage[] = [
  {
    slug: "arborists",
    label: "Arborists",
    title: "Bring every tree into focus.",
    description: "Map trees, work zones, access routes, and site conditions so arborist crews can plan safer visits and leave a clearer record behind.",
    sectionTitle: "From a site walk to a working tree map.",
    sectionLead: "Keep tree work connected to the exact places crews inspect, climb, prune, remove, and revisit.",
    workflow: [
      { icon: "walk", title: "Walk the site", copy: "Record access routes, slopes, staging areas, and the path from the truck to the work zone." },
      { icon: "pin", title: "Mark the tree", copy: "Drop locations for trees, hazards, utilities, gates, targets, and equipment constraints." },
      { icon: "camera", title: "Document conditions", copy: "Attach photos and notes that preserve what the crew saw before work begins." },
      { icon: "share", title: "Share the plan", copy: "Send a focused map to the estimator, crew lead, property owner, or utility partner." },
    ],
    audienceTitle: "Built for work that starts on the ground.",
    audienceLead: "Give every person on the job the same spatial context, even when the next visit happens months later.",
    audiences: ["Tree care companies", "Utility arborists", "Municipal forestry crews", "Consulting arborists", "Storm response teams", "Campus grounds teams", "Estate managers", "Landscape maintenance crews"],
    closingTitle: "Make every tree visit more informed.",
    closingCopy: "Capture the site once, keep the field record current, and hand crews the location-specific context they need.",
    imageAlt: "An arborist inspecting a mature tree on a landscaped property.",
    visualLabels: ["tree inventory", "crew access"],
  },
  {
    slug: "trail-builders",
    label: "Trail builders",
    title: "Build the trail from the field map.",
    description: "Track trail alignments, structures, materials, and maintenance needs while the work is still happening on the ground.",
    sectionTitle: "Turn trail work into a shared field record.",
    sectionLead: "Keep route decisions, construction notes, and follow-up work tied to the terrain instead of scattered across messages and memory.",
    workflow: [
      { icon: "walk", title: "Walk the alignment", copy: "Record the proposed line, reroutes, access points, and the sections that need another look." },
      { icon: "pin", title: "Mark trail work", copy: "Map drainage, crossings, structures, erosion, material drops, and construction priorities." },
      { icon: "camera", title: "Document progress", copy: "Pair photos and notes with exact locations so volunteers and crews can see what changed." },
      { icon: "share", title: "Share the handoff", copy: "Give project partners a current route map for planning, inspection, and maintenance." },
    ],
    audienceTitle: "For trails that keep evolving.",
    audienceLead: "A practical map helps crews return to the right place with the right context, season after season.",
    audiences: ["Trail construction firms", "Volunteer trail crews", "Parks departments", "Conservation corps", "Mountain bike trail teams", "Backcountry organizations", "Public land agencies", "Trail consultants"],
    closingTitle: "Keep the work moving forward.",
    closingCopy: "Map the decisions, document the details, and give the next crew a better place to start.",
    imageAlt: "A trail builder shaping a woodland trail beside drainage work.",
    visualLabels: ["new alignment", "drainage check"],
  },
  {
    slug: "landscaping",
    label: "Landscaping",
    title: "Put every landscape detail in place.",
    description: "Map beds, irrigation, access, plantings, and maintenance issues so landscape teams can work from the same current picture.",
    sectionTitle: "From a property walk to a repeatable service map.",
    sectionLead: "Keep the practical knowledge of a landscape visit attached to the beds, routes, and systems your team manages.",
    workflow: [
      { icon: "walk", title: "Walk the grounds", copy: "Record service routes, gates, beds, slopes, irrigation zones, and areas that need special access." },
      { icon: "pin", title: "Mark the detail", copy: "Drop locations for plants, leaks, fixtures, damage, utilities, and seasonal work." },
      { icon: "camera", title: "Document the condition", copy: "Add photos and notes that help a crew understand the issue before arriving." },
      { icon: "share", title: "Share the service map", copy: "Send crews, clients, and subcontractors the same location-specific instructions." },
    ],
    audienceTitle: "Made for landscapes with a lot to remember.",
    audienceLead: "Replace scattered property notes with a field map that stays useful between visits and across crews.",
    audiences: ["Landscape contractors", "Commercial maintenance teams", "Irrigation companies", "Garden designers", "HOA grounds teams", "Resort landscapers", "Sports field crews", "Residential gardeners"],
    closingTitle: "Make the next service visit easier.",
    closingCopy: "Map it once, keep it current, and give every crew a clearer way to get the work done.",
    imageAlt: "A landscaping professional walking through maintained garden beds on a commercial property.",
    visualLabels: ["irrigation zone", "planting bed"],
  },
  {
    slug: "landscape-architecture",
    label: "Landscape architecture",
    title: "Keep design grounded in the site.",
    description: "Capture site conditions, circulation, materials, and field observations in a map your design and construction teams can share.",
    sectionTitle: "Connect the design conversation to the ground.",
    sectionLead: "Carry observations from site walks into planning, stakeholder conversations, documentation, and construction follow-through.",
    workflow: [
      { icon: "walk", title: "Read the site", copy: "Trace circulation, views, grades, edges, and the conditions that shape the design response." },
      { icon: "pin", title: "Place observations", copy: "Mark constraints, opportunities, utilities, materials, access, and stakeholder priorities." },
      { icon: "camera", title: "Document context", copy: "Bring photos and concise field notes into the same spatial record as the route." },
      { icon: "share", title: "Share the site story", copy: "Give clients, consultants, and builders a clear map of what the design is responding to." },
    ],
    audienceTitle: "For design teams working across scales.",
    audienceLead: "Use one lightweight field record from early site analysis through construction observation and future stewardship.",
    audiences: ["Landscape architecture studios", "Urban design teams", "Campus planners", "Public realm projects", "Residential design firms", "Park planning teams", "Civil consultants", "Design-build practices"],
    closingTitle: "Let the site stay in the conversation.",
    closingCopy: "Capture the field context behind each decision and make it easier for the whole project team to see the same place.",
    imageAlt: "A landscape architect reviewing a site plan beside a planted public space.",
    visualLabels: ["site observation", "circulation"],
  },
  {
    slug: "forestry",
    label: "Forestry",
    title: "Carry the forest record with you.",
    description: "Map stands, access routes, field observations, and work areas so forestry teams can coordinate decisions across large, changing landscapes.",
    sectionTitle: "Build a field record that follows the forest.",
    sectionLead: "Keep observations and operational details connected to the places where crews assess, manage, restore, and return.",
    workflow: [
      { icon: "walk", title: "Walk the stand", copy: "Track routes through stands, access roads, boundaries, and areas that need a closer inspection." },
      { icon: "pin", title: "Mark the work", copy: "Place observations for treatments, hazards, water, structures, staging, and priority areas." },
      { icon: "camera", title: "Document the ground", copy: "Capture photos and notes that make a remote site easier to understand later." },
      { icon: "share", title: "Share the field record", copy: "Give managers, contractors, crews, and partners a focused map for the next decision." },
    ],
    audienceTitle: "For teams managing more ground than memory can hold.",
    audienceLead: "Create a durable, practical layer of field knowledge without asking every collaborator to learn a complex GIS system.",
    audiences: ["Forest managers", "Timber contractors", "Reforestation teams", "Consulting foresters", "Watershed crews", "Wildfire mitigation teams", "Research plots", "Private woodland owners"],
    closingTitle: "Make the next forest visit count.",
    closingCopy: "Keep route knowledge, observations, and work priorities together wherever the work takes you.",
    imageAlt: "A forester walking an access road through a mixed hardwood forest.",
    visualLabels: ["stand boundary", "access road"],
  },
  {
    slug: "land-management",
    label: "Land management",
    title: "See the land as a working system.",
    description: "Map access, infrastructure, stewardship work, and field observations so land managers can coordinate people and priorities across a property.",
    sectionTitle: "Turn stewardship into a location-aware workflow.",
    sectionLead: "Give every field visit a shared geographic record, from the first observation to the next crew handoff.",
    workflow: [
      { icon: "walk", title: "Walk the land", copy: "Record routes, boundaries, access points, water, structures, and areas that need attention." },
      { icon: "pin", title: "Mark priorities", copy: "Place issues, projects, invasive species, erosion, repairs, and monitoring locations." },
      { icon: "camera", title: "Document change", copy: "Add photos and notes so the condition of the land is easier to compare over time." },
      { icon: "share", title: "Share the assignment", copy: "Send crews, volunteers, vendors, and partners a clear map for the next action." },
    ],
    audienceTitle: "For people responsible for the whole property.",
    audienceLead: "Keep practical stewardship knowledge visible across seasons, teams, and changing priorities.",
    audiences: ["Conservation organizations", "Ranch and estate teams", "Land trusts", "Parks operations", "Watershed groups", "Habitat restoration teams", "Rural property teams", "Environmental consultants"],
    closingTitle: "Keep stewardship connected to place.",
    closingCopy: "Map what you see, document what changes, and make the next field decision easier to share.",
    imageAlt: "A land steward surveying a meadow and wetland edge from a rural access track.",
    visualLabels: ["restoration area", "water access"],
  },
  {
    slug: "tour-operators",
    label: "Tour operators",
    title: "Give every trip a better sense of place.",
    description: "Map routes, meeting points, access notes, and memorable stops so guides can lead with more context and guests can follow with confidence.",
    sectionTitle: "From route knowledge to a smoother guest experience.",
    sectionLead: "Keep the details that make a trip work attached to the route your guides actually travel.",
    workflow: [
      { icon: "walk", title: "Walk the route", copy: "Record the path, approach, meeting points, breaks, viewpoints, and places guides need to know." },
      { icon: "pin", title: "Mark the moment", copy: "Place stops, hazards, pickup points, access notes, and the stories that belong to each location." },
      { icon: "camera", title: "Document the experience", copy: "Capture photos and field notes that help new guides learn the route quickly." },
      { icon: "share", title: "Share the itinerary", copy: "Send guests, guides, drivers, and partners a focused map without overwhelming them." },
    ],
    audienceTitle: "Built for trips that depend on local knowledge.",
    audienceLead: "Create a repeatable route record while leaving room for the judgment and personality of the guide.",
    audiences: ["Hiking guides", "Fishing outfitters", "Kayak operators", "Cycling tour companies", "Wildlife guides", "Adventure travel teams", "Cultural tours", "Outdoor educators"],
    closingTitle: "Make every route easier to lead.",
    closingCopy: "Capture the route knowledge your best guides carry and make it useful to the whole team.",
    imageAlt: "A hiking guide leading a small group along a scenic mountain trail.",
    visualLabels: ["meeting point", "scenic stop"],
  },
  {
    slug: "property-management",
    label: "Property management",
    title: "Keep the whole property in view.",
    description: "Map properties, document maintenance needs, mark utilities and access points, and share exact locations with property crews and contractors.",
    sectionTitle: "From a walk-through to a clear handoff.",
    sectionLead: "Create a persistent geographic record of the places your team manages, then give the next person the context they need at the exact location.",
    workflow: [
      { icon: "walk", title: "Walk the property", copy: "Record routes through buildings, grounds, access roads, service areas, and the places crews actually need to reach." },
      { icon: "pin", title: "Mark an issue", copy: "Drop a waypoint for a drainage problem, fallen tree, gate, utility, leak, hazard, or repair location." },
      { icon: "camera", title: "Document it", copy: "Add a photo and location-specific instructions so the condition is understandable without another walk-through." },
      { icon: "share", title: "Share the handoff", copy: "Send the exact location to an employee, vendor, landscaper, maintenance company, or contractor." },
    ],
    audienceTitle: "Built for complex properties.",
    audienceLead: "Property teams can keep practical field knowledge connected to the land instead of scattering it across text threads, memory, and outdated spreadsheets.",
    audiences: ["HOAs and residential communities", "Resorts and hospitality properties", "Commercial campuses", "Apartment communities", "Campgrounds and vacation properties", "Large private estates", "Property maintenance companies", "Landscaping and facilities teams"],
    closingTitle: "Make the next visit easier.",
    closingCopy: "Walk it once, keep the map current, and give every crew the same reliable location-specific instructions.",
    imageAlt: "A facilities professional walking landscaped grounds at a large property.",
    visualLabels: ["utility access", "maintenance"],
  },
];

function pageStyles(): string {
  return `<style>
    .industry-hero{padding:5.5rem 0 4.5rem;background:linear-gradient(145deg,#eef1e8 0%,#f7f5ef 64%,#e8eee5 100%);border-bottom:1px solid var(--border)}
    .industry-hero .wrap{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(19rem,.7fr);gap:4rem;align-items:center}
    .industry-hero h1,.industry-section h2{color:#292823}
    .industry-hero h1{font-size:clamp(2.5rem,6vw,5rem);line-height:1.02;max-width:10ch;margin:.65rem 0 1.25rem}
    .industry-lead{font-size:1.15rem;line-height:1.7;color:#625f57;max-width:42rem}
    .industry-hero .btn.outline{color:#292823;border-color:#292823;background:rgba(255,255,255,.24)}
    .industry-hero .btn.outline:hover{background:rgba(255,255,255,.62)}
    .industry-kicker{font-family:var(--font-mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--primary);font-weight:700}
    .industry-photo{margin:0;min-height:20rem;border:1px solid rgba(60,98,70,.25);border-radius:1.5rem;overflow:hidden;background:#dfe9db;box-shadow:0 24px 55px -35px rgba(28,58,38,.65)}
    .industry-photo img{display:block;width:100%;height:100%;min-height:20rem;object-fit:cover;object-position:center}
    .industry-section{padding:5rem 0}
    .industry-section h2{font-size:clamp(2rem,4vw,3.2rem);max-width:14ch;margin:.6rem 0 1rem}
    .industry-section .section-lead{color:var(--muted-foreground);font-size:1.05rem;line-height:1.7;max-width:43rem}
    .workflow-section{background:#25221f;color:#f7f3e9;border-top:1px solid #3b3732;border-bottom:1px solid #3b3732}
    .workflow-section h2{color:#f7f3e9}
    .workflow-section .industry-kicker{color:#8ebd92}
    .workflow-section .section-lead{color:#ded7cb}
    .workflow-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;margin-top:2.5rem}
    .workflow-card{border:1px solid rgba(247,243,233,.16);background:rgba(255,255,255,.055);border-radius:1rem;padding:1.3rem;min-height:14rem}
    .workflow-icon{width:2.6rem;height:2.6rem;border-radius:50%;display:grid;place-items:center;color:#b9d8b8;background:rgba(142,189,146,.13);border:1px solid rgba(142,189,146,.32);margin-bottom:1.2rem}
    .workflow-icon svg{width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
    .workflow-card h3{font-family:var(--font-serif);font-size:1.35rem;margin:0 0 .5rem;color:#f7f3e9}
    .workflow-card p{color:#ded7cb;font-size:.92rem;line-height:1.6;margin:0}
    .audience-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin-top:1.5rem;max-width:45rem}
    .audience-item{padding:.9rem 1rem;border:1px solid var(--border);border-radius:.7rem;background:var(--card);font-size:.94rem}
    .audience-item:before{content:"";display:inline-block;width:.45rem;height:.45rem;border-radius:50%;background:var(--primary);margin:0 .65rem .1rem 0}
    @media(max-width:800px){.industry-hero .wrap{grid-template-columns:1fr;gap:2.5rem}.industry-photo,.industry-photo img{min-height:15rem}.workflow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:500px){.workflow-grid,.audience-grid{grid-template-columns:1fr}.industry-hero{padding:3.5rem 0}.industry-section{padding:3.5rem 0}}
  </style>`;
}

function getPage(slug: string): IndustryPage | null {
  return INDUSTRIES.find((industry) => industry.slug === slug) ?? null;
}

export function getIndustryHtml(req: Request, slug: string): string | null {
  const page = getPage(slug);
  if (!page) return null;
  const origin = originFor(req);
  const canonical = `${origin}/industries/${page.slug}`;
  const title = `${page.label} Field Mapping | mapper.one`;
  const body = `${pageStyles()}<main>
    <section class="industry-hero"><div class="wrap">
      <div><p class="industry-kicker">${escapeHtml(page.label)}</p><h1>${escapeHtml(page.title)}</h1><p class="industry-lead">${escapeHtml(page.description)}</p><div class="cta-row" style="margin-top:1.75rem"><a class="btn" href="/#get-app">Start mapping</a><a class="btn outline" href="/#industries">Explore industries</a></div></div>
      <figure class="industry-photo"><img src="/media/industries/industry-${encodeURIComponent(page.slug)}.jpg" alt="${escapeHtml(page.imageAlt)}" width="1024" height="768" fetchpriority="high" /></figure>
    </div></section>
    <section class="industry-section workflow-section"><div class="wrap"><p class="industry-kicker">The field workflow</p><h2>${escapeHtml(page.sectionTitle)}</h2><p class="section-lead">${escapeHtml(page.sectionLead)}</p>
      <div class="workflow-grid">${page.workflow.map((step) => `<article class="workflow-card"><div class="workflow-icon">${ICONS[step.icon]}</div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.copy)}</p></article>`).join("")}</div>
    </div></section>
    <section class="industry-section" style="background:var(--card);border-top:1px solid var(--border);border-bottom:1px solid var(--border)"><div class="wrap"><p class="industry-kicker">Who it helps</p><h2>${escapeHtml(page.audienceTitle)}</h2><p class="section-lead">${escapeHtml(page.audienceLead)}</p><div class="audience-grid">${page.audiences.map((audience) => `<div class="audience-item">${escapeHtml(audience)}</div>`).join("")}</div></div></section>
    ${ctaBand(page.closingTitle, page.closingCopy)}
  </main>`;
  return renderShell({
    title,
    description: page.description,
    canonical,
    ogImage: `${origin}/opengraph.jpg`,
    ogType: "article",
    activeNav: "/use-cases",
    schema: [{
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: page.description,
      mainEntityOfPage: canonical,
      author: { "@type": "Organization", name: "mapper.one" },
      publisher: { "@type": "Organization", name: "mapper.one" },
    }],
    body,
  });
}

export function getPropertyManagementHtml(req: Request): string {
  return getIndustryHtml(req, "property-management") ?? "";
}

export function allIndustryPaths(): string[] {
  return INDUSTRY_SLUGS.map((slug) => `/industries/${slug}`);
}