import type { Request } from "express";

/**
 * Server-rendered SEO pages for mapper.one.
 *
 * The marketing site (artifacts/site) is a client-rendered Vite SPA, so its
 * routes are invisible to search-engine crawlers that don't execute JS. These
 * pages are rendered to complete HTML strings by the Express api-server instead
 * and routed to it by the shared reverse proxy (see artifact.toml `paths`), so
 * Googlebot sees real content on first fetch. Branding mirrors the SPA
 * (Fraunces/Inter/Space Mono, the earthy moss-green palette) so navigating
 * between the two feels seamless.
 */

/** Escape a string for safe interpolation into HTML text / attribute context. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The public origin to use for canonical/OG/sitemap URLs (e.g.
 * https://mapper.one).
 *
 * In production these pages are served with `Cache-Control: public`, so we must
 * NOT derive the origin from the incoming Host header — a forged Host on a
 * cacheable response would poison the canonical/sitemap origin for everyone.
 * Instead we pin to the first REPLIT_DOMAINS entry (the real deployment domain),
 * matching the pattern in routes/donate.ts. In development REPLIT_DOMAINS is the
 * dev domain (or unset), so we fall back to the request host, which is fine
 * because dev responses are uncached and not indexed.
 */
export function originFor(req: Request): string {
  const trusted = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (trusted) return `https://${trusted}`;
  const host = req.get("host") ?? "mapper.one";
  return `${req.protocol}://${host}`;
}

const COMPASS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`;

function sharedCss(): string {
  return `
:root{
  --background:hsl(40 20% 95%);--foreground:hsl(20 10% 15%);
  --border:hsl(40 15% 85%);--card:hsl(40 20% 97%);
  --primary:hsl(135 15% 35%);--primary-foreground:hsl(40 20% 95%);
  --secondary:hsl(35 25% 85%);--muted:hsl(40 10% 90%);
  --muted-foreground:hsl(40 5% 45%);
  --font-sans:'Inter',system-ui,sans-serif;
  --font-serif:'Fraunces',Georgia,serif;
  --font-mono:'Space Mono',ui-monospace,monospace;
  --radius:0.75rem;
}
@media (prefers-color-scheme:dark){:root{
  --background:hsl(20 10% 12%);--foreground:hsl(40 20% 90%);
  --border:hsl(20 10% 22%);--card:hsl(20 10% 15%);
  --primary:hsl(135 25% 45%);--primary-foreground:hsl(20 10% 10%);
  --secondary:hsl(20 15% 25%);--muted:hsl(20 10% 20%);
  --muted-foreground:hsl(40 10% 60%);
}}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--font-sans);background:var(--background);color:var(--foreground);line-height:1.65;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:var(--font-serif);font-weight:600;line-height:1.1;letter-spacing:-0.01em;color:var(--foreground)}
a{color:inherit;text-decoration:none}
.wrap{max-width:72rem;margin:0 auto;padding:0 1.5rem}
.narrow{max-width:48rem}
.eyebrow{font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.15em;font-size:0.72rem;font-weight:700;color:var(--primary)}
.muted{color:var(--muted-foreground)}
.lead{font-size:1.2rem;font-weight:300;color:var(--muted-foreground)}

/* header */
header.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--background) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
header.nav .row{height:4rem;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:0.5rem;font-family:var(--font-serif);font-weight:600;font-size:1.125rem;letter-spacing:0.01em}
.brand svg{width:1.25rem;height:1.25rem;color:var(--primary)}
.nav-links{display:flex;align-items:center;gap:1.25rem;font-size:0.875rem;font-weight:500;white-space:nowrap}
.nav-links a{color:var(--muted-foreground);transition:color .15s}
.nav-links a:hover{color:var(--foreground)}
.btn{display:inline-flex;align-items:center;gap:.5rem;background:var(--primary);color:var(--primary-foreground);padding:.6rem 1.25rem;border-radius:999px;font-weight:600;font-size:.9rem;transition:filter .15s,transform .15s}
.btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn.outline{background:transparent;color:var(--foreground);border:1px solid var(--border)}
@media(max-width:640px){.nav-hide{display:none}.nav-links{gap:.65rem;font-size:.8rem}.nav-links .btn{padding:.5rem .8rem;font-size:.8rem}.brand{font-size:1rem}}

/* hero */
.hero{padding:4.5rem 0 2.5rem}
.hero h1{font-size:clamp(2.2rem,5vw,3.6rem);text-wrap:balance;margin:1rem 0}
.hero .lead{max-width:42rem}
.cta-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.75rem}

/* breadcrumb */
.crumbs{font-size:.8rem;color:var(--muted-foreground);font-family:var(--font-mono);padding-top:1.5rem}
.crumbs a:hover{color:var(--foreground)}

/* sections */
section.block{padding:2.25rem 0;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
section.block h2{font-size:clamp(1.5rem,3vw,2.1rem);margin-bottom:1rem}
section.block h3{font-size:1.2rem;margin:1.25rem 0 .4rem}
section.block p{margin-bottom:1rem;max-width:46rem}
section.block ul{margin:0 0 1rem 1.1rem}
section.block li{margin-bottom:.45rem;max-width:44rem}

/* table */
.tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);margin:1rem 0}
table{border-collapse:collapse;width:100%;font-size:.92rem;min-width:540px}
th,td{text-align:left;padding:.75rem 1rem;border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent);vertical-align:top}
thead th{background:color-mix(in srgb,var(--secondary) 50%,transparent);font-family:var(--font-mono);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
tbody tr:last-child td{border-bottom:none}
td.feat{font-weight:600}
.us{color:var(--primary);font-weight:600}

/* cards */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;margin-top:1.25rem}
.card{display:block;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;transition:transform .2s,border-color .2s,box-shadow .2s}
.card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--primary) 40%,var(--border));box-shadow:0 8px 24px -12px rgba(0,0,0,.18)}
.card h3{font-size:1.1rem;margin:0 0 .35rem}
.card p{font-size:.875rem;color:var(--muted-foreground);margin:0}
.card .go{display:inline-block;margin-top:.75rem;font-size:.8rem;font-weight:600;color:var(--primary)}

/* two columns */
.cols{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:.5rem}
@media(max-width:720px){.cols{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.4rem}
.panel.win{border-color:color-mix(in srgb,var(--primary) 35%,var(--border))}

/* faq */
.faq h3{font-size:1.05rem}
.faq p{color:var(--muted-foreground)}

/* cta band */
.ctaband{background:color-mix(in srgb,var(--primary) 8%,var(--background));border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:3rem 0;margin-top:2.5rem;text-align:center}
.ctaband h2{font-size:clamp(1.6rem,3vw,2.3rem);margin-bottom:.75rem}
.ctaband p{color:var(--muted-foreground);max-width:34rem;margin:0 auto 1.5rem}

/* field guides */
.guide-hero,.guide-article-hero{padding:4.5rem 0 3rem;background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 8%,var(--background)),var(--background) 58%)}
.guide-hero h1,.guide-article-hero h1{font-size:clamp(2.35rem,5vw,4rem);margin:1rem 0;max-width:16ch}
.guide-article-hero .lead{max-width:48rem}
.guide-library,.guide-related,.guide-community{padding:3.5rem 0}
.guide-related{border-top:1px solid var(--border);background:color-mix(in srgb,var(--secondary) 22%,var(--background))}
.guide-community{border-top:1px solid var(--border)}
.guide-library-head{display:flex;justify-content:space-between;gap:2rem;align-items:end;margin-bottom:1.5rem}
.guide-library-head h2,.guide-related h2{font-size:clamp(1.7rem,3vw,2.5rem);margin-top:.45rem}
.guide-library-head>p{max-width:25rem;color:var(--muted-foreground)}
.guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
.guide-grid-small{grid-template-columns:repeat(2,minmax(0,1fr));max-width:52rem}
.guide-card{display:flex;min-height:15.5rem;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:1.35rem;transition:transform .18s,border-color .18s,box-shadow .18s}
.guide-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--primary) 48%,var(--border));box-shadow:0 12px 28px -16px rgba(25,35,24,.38)}
.guide-audience,.guide-read,.guide-meta{font-family:var(--font-mono);font-size:.72rem;letter-spacing:.035em;color:var(--muted-foreground)}
.guide-audience{color:var(--primary);font-weight:700;text-transform:uppercase}
.guide-card h2{font-size:1.35rem;margin:.7rem 0 .55rem}
.guide-card p{font-size:.91rem;color:var(--muted-foreground);line-height:1.55}
.guide-read{margin-top:auto;padding-top:1.25rem;color:var(--primary);font-weight:700}
.community-card .guide-read{color:var(--muted-foreground);font-weight:400}
.guide-content-layout{display:grid;grid-template-columns:13rem minmax(0,44rem);justify-content:center;gap:3rem;padding-top:3.25rem;padding-bottom:4.25rem}
.guide-toc{position:sticky;top:5.5rem;height:max-content;border-left:2px solid color-mix(in srgb,var(--primary) 50%,var(--border));padding-left:1rem}
.guide-toc ol{list-style:none;margin-top:.65rem}
.guide-toc li{margin:.45rem 0;font-size:.84rem;line-height:1.4;color:var(--muted-foreground)}
.guide-toc a:hover{color:var(--primary)}
.guide-prose{max-width:44rem}
.guide-prose h2{font-size:clamp(1.55rem,3vw,2.15rem);margin:2.8rem 0 .85rem}
.guide-prose h2:first-child{margin-top:0}
.guide-prose p{max-width:42rem;color:var(--foreground);font-size:1.06rem;line-height:1.78;margin-bottom:1rem}
.guide-section{scroll-margin-top:6rem}
.guide-checklist{padding:1.15rem 1.25rem 1.15rem 2.4rem;border:1px solid var(--border);border-radius:var(--radius);background:color-mix(in srgb,var(--secondary) 28%,var(--background));margin:1.25rem 0}
.guide-checklist li{margin:.45rem 0;max-width:40rem}
.guide-faqs{margin-top:3.5rem;border-top:1px solid var(--border)}
.guide-faq{border-bottom:1px solid var(--border);padding:1rem 0}
.guide-faq summary{cursor:pointer;font-weight:650;font-size:1rem}
.guide-faq p{font-size:.96rem;color:var(--muted-foreground);margin: .75rem 0 0}
.guide-cover{margin:0 0 2rem}.guide-cover img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--border);border-radius:var(--radius)}.guide-cover figcaption{font-size:.8rem;font-style:italic;color:var(--muted-foreground);margin-top:.5rem}
@media(max-width:800px){.guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.guide-content-layout{display:block}.guide-toc{position:static;border-left:0;border-top:1px solid var(--border);padding:1.2rem 0;margin-bottom:2rem}.guide-toc ol{columns:2;gap:1.5rem}.guide-library-head{display:block}.guide-library-head>p{margin-top:1rem}}
@media(max-width:520px){.guide-grid,.guide-grid-small{grid-template-columns:1fr}.guide-hero,.guide-article-hero{padding:3.5rem 0 2.5rem}.guide-toc ol{columns:1}}

/* footer */
 footer.site{padding:3.25rem 0 2.5rem;border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent);background:color-mix(in srgb,var(--muted) 22%,var(--background))}
 footer.site .footer-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,auto);gap:2rem 3rem;align-items:start}
 footer.site .footer-intro .brand{margin-bottom:.8rem}
 footer.site .footer-intro .copy{margin:0}
 footer.site .links{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.65rem 1.35rem;grid-column:1/-1;padding-top:1.25rem;border-top:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:.875rem;color:var(--muted-foreground)}
footer.site .links a:hover{color:var(--foreground)}
.copy{font-size:.85rem;color:var(--muted-foreground);font-weight:300;max-width:26rem}
 @media(max-width:640px){footer.site .footer-grid{grid-template-columns:1fr;gap:1.25rem}footer.site .links{justify-content:flex-start}}
`;
}

function header(active: string): string {
  const link = (href: string, label: string, hideMobile = false) =>
    `<a href="${href}"${hideMobile ? ' class="nav-hide"' : ""}${
      active === href ? ' aria-current="page"' : ""
    }>${label}</a>`;
  return `<header class="nav"><div class="wrap row">
    <a class="brand" href="/">${COMPASS_SVG}<span>mapper.one</span></a>
    <nav class="nav-links">
        ${link("/#activities", "Activities", true)}
        ${link("/#features", "Features", true)}
       ${link("/trails", "Trails")}
       ${link("/use-cases", "Use Cases", true)}
        ${link("/commercial", "For organizations", true)}
      <a class="btn" href="/#get-app">Get the App</a>
    </nav>
  </div></header>`;
}

function footer(): string {
  const year = new Date().getFullYear();
  return `<footer class="site"><div class="wrap footer-grid">
    <div class="footer-intro"><div class="brand">${COMPASS_SVG}<span>mapper.one</span></div>
    <p class="copy">© ${year} The Adventure Collective. Map the places where you work.</p></div>
    <div class="footer-meta"><p class="copy">Built for field teams, trail crews, and curious people who go outside.</p></div>
    <nav class="links" aria-label="Footer">
      <a href="/compare">Compare</a>
      <a href="/trails">Trails</a>
      <a href="/use-cases">Use Cases</a>
      <a href="/sitemap">Sitemap</a>
      <a href="/support">Support</a>
      <a href="/delete-data">Delete data</a>
      <a href="/delete-account">Delete account</a>
      <a href="mailto:info@advcollective.com">info@advcollective.com</a>
      <a href="https://advcollective.com">advcollective.com</a>
    </nav>
  </div></footer>`;
}

export interface ShellOptions {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType?: "website" | "article";
  /** Defaults to public indexing; private capability pages override this. */
  robots?: string;
  activeNav?: string;
  /** JSON-LD objects rendered as <script type="application/ld+json">. */
  schema?: object[];
  body: string;
}

/** Render a complete, crawlable HTML document with shared chrome. */
export function renderShell(opts: ShellOptions): string {
  const {
    title,
    description,
    canonical,
    ogImage,
    ogType = "website",
    robots = "index,follow,max-image-preview:large",
    schema = [],
    body,
  } = opts;
  const schemaTags = schema
    .map(
      (s) =>
        `<script type="application/ld+json">${JSON.stringify(s).replace(
          /</g,
          "\\u003c",
        )}</script>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta name="robots" content="${escapeHtml(robots)}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="mapper.one" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
<style>${sharedCss()}</style>
${schemaTags}
</head>
<body>
${header(opts.activeNav ?? "")}
<main>${body}</main>
${footer()}
</body>
</html>`;
}

/** A reusable closing call-to-action band linking to the app + donations. */
export function ctaBand(heading: string, sub: string): string {
  return `<div class="ctaband"><div class="wrap narrow">
    <h2>${escapeHtml(heading)}</h2>
    <p>${escapeHtml(sub)}</p>
    <div class="cta-row" style="justify-content:center">
      <a class="btn" href="/#get-app">Get the mobile app</a>
      <a class="btn outline" href="/support">Support the project</a>
    </div>
  </div></div>`;
}
