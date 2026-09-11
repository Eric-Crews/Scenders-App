import { Router, type IRouter } from "express";
import {
  getHubHtml,
  getComparisonHtml,
  getRoundupHtml,
  allSeoPaths,
  ROUNDUP_PATH_SLUG,
} from "../seo/comparisons";
import { escapeHtml, originFor, renderShell } from "../seo/ssrShared";
import { allGuidePaths, getGuideHtml, getGuideIndexHtml } from "../seo/guides";
import { db, blogPostsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { publicMapSitemapCount, publicMapSitemapEntries } from "./maps";
import { allIndustryPaths, getIndustryHtml } from "../seo/industryPages";
import { publicTrailGuideSitemapEntries, publicTrailHubSitemapEntries } from "./trailGuides";
import { publicBlogSitemapEntries } from "./blog";

/**
 * Server-rendered SEO pages, mounted at the site root (not under /api). The
 * shared reverse proxy routes /compare, /blog, /use-cases, /sitemap.xml, and /robots.txt to this
 * service via the api-server artifact.toml `paths`; everything else stays with
 * the SPA. See src/seo/ssrShared.ts for the rationale.
 */
const router: IRouter = Router();
const PUBLIC_ROOT_PATHS = ["/", "/trails", "/sitemap", "/blog", "/support", "/privacy"];
const SITEMAP_URL_LIMIT = 45_000;

type SitemapEntry = { path: string; updatedAt: string };

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function uniqueSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const byPath = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const existing = byPath.get(entry.path);
    if (!existing || entry.updatedAt > existing.updatedAt) byPath.set(entry.path, entry);
  }
  return [...byPath.values()];
}

function sitemapUrlset(origin: string, entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueSitemapEntries(entries)
    .map((entry) => `  <url><loc>${escapeXml(`${origin}${entry.path}`)}</loc><lastmod>${entry.updatedAt}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;
}

function sitemapIndex(origin: string, entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((entry) => `  <sitemap><loc>${escapeXml(`${origin}${entry.path}`)}</loc><lastmod>${entry.updatedAt}</lastmod></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;
}

// Static marketing pages change rarely; let the CDN/proxy cache them in
// production. In development, stay uncached so edits show on refresh.
function htmlHeaders(res: import("express").Response): void {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    process.env.NODE_ENV === "production"
      ? "public, max-age=86400, stale-while-revalidate=604800"
      : "no-cache",
  );
}

router.get("/compare", (req, res) => {
  htmlHeaders(res);
  res.send(getHubHtml(req));
});

router.get("/compare/:slug", (req, res) => {
  const { slug } = req.params;
  const html =
    slug === ROUNDUP_PATH_SLUG
      ? getRoundupHtml(req)
      : getComparisonHtml(req, slug);
  if (!html) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  htmlHeaders(res);
  res.send(html);
});

async function renderUseCases(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const communityNotes = await db
    .select({
      slug: blogPostsTable.slug,
      title: blogPostsTable.title,
      excerpt: blogPostsTable.excerpt,
      locationName: blogPostsTable.locationName,
      author: blogPostsTable.author,
      createdAt: blogPostsTable.createdAt,
    })
    .from(blogPostsTable)
    .orderBy(desc(blogPostsTable.createdAt));
  htmlHeaders(res);
  res.send(getGuideIndexHtml(req, communityNotes));
}

router.get("/use-cases", renderUseCases);

router.get("/industries/:slug", (req, res): void => {
  const html = getIndustryHtml(req, req.params.slug);
  if (!html) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  htmlHeaders(res);
  res.send(html);
});

router.get("/use-cases/:slug", (req, res): void => {
  const guideHtml = getGuideHtml(req, req.params.slug);
  if (!guideHtml) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  htmlHeaders(res);
  res.send(guideHtml);
});

router.get("/robots.txt", (req, res) => {
  const origin = originFor(req);
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
});

router.get("/sitemap", async (req, res): Promise<void> => {
  const origin = originFor(req);
  const [communityMapCount, blogPosts, trailGuides, trailHubs] = await Promise.all([
    publicMapSitemapCount(),
    publicBlogSitemapEntries(),
    publicTrailGuideSitemapEntries(),
    publicTrailHubSitemapEntries(),
  ]);
  const groups = [
    {
      title: "Core pages",
      paths: [...PUBLIC_ROOT_PATHS, "/compare", "/use-cases"],
    },
    { title: "Comparisons", paths: allSeoPaths() },
    { title: "Use cases and field notes", paths: allGuidePaths() },
    {
      title: "Blog posts",
      paths: blogPosts.map((post) => `/blog/${encodeURIComponent(post.slug)}`),
    },
    { title: "Industry guides", paths: allIndustryPaths() },
    {
      title: `Community maps (${communityMapCount.toLocaleString()})`,
      paths: communityMapCount ? ["/sitemap.xml?section=maps&page=1"] : [],
    },
    {
      title: "Enhanced trail guides",
      paths: trailGuides.map((guide) => `/trails/${encodeURIComponent(guide.slug)}`),
    },
    {
      title: "Trail locations",
      paths: trailHubs.map((hub) => `/trails/${encodeURIComponent(hub.slug)}`),
    },
  ];
  const sections = groups
    .map(({ title, paths }) => {
      const uniquePaths = [...new Set(paths)];
      if (!uniquePaths.length) return "";
      return `<section class="sitemap-group"><h2>${escapeHtml(title)}</h2><ul>${uniquePaths
        .map((path) => `<li><a href="${escapeHtml(path)}">${escapeHtml(path === "/" ? "mapper.one home" : path)}</a></li>`)
        .join("")}</ul></section>`;
    })
    .join("");
  const body = `<main class="sitemap-page"><div class="wrap"><p class="eyebrow">Public route index</p><h1>Explore mapper.one</h1><p class="lead">A human-readable index of public pages, community maps, industry guides, and enhanced trail guides. Private projects and account-only routes are intentionally excluded.</p><p><a class="btn" href="/sitemap.xml">Open XML sitemap for search engines</a></p><div class="sitemap-grid">${sections}</div></div></main><style>.sitemap-page{padding:5rem 0}.sitemap-page h1{font-size:clamp(2.7rem,6vw,5rem);margin:.6rem 0 1rem;color:#292823}.sitemap-page .lead{max-width:48rem;color:var(--muted-foreground);font-size:1.1rem;line-height:1.7}.sitemap-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-top:3rem}.sitemap-group{border:1px solid var(--border);background:var(--card);border-radius:1rem;padding:1.3rem}.sitemap-group h2{font-family:var(--font-serif);font-size:1.35rem;margin:0 0 .8rem;color:#292823}.sitemap-group ul{list-style:none;padding:0;margin:0}.sitemap-group li{border-top:1px solid var(--border);padding:.55rem 0}.sitemap-group a{color:var(--primary);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}@media(max-width:650px){.sitemap-page{padding:3rem 0}.sitemap-grid{grid-template-columns:1fr}}</style>`;
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(renderShell({
    title: "Sitemap | mapper.one",
    description: "Browse public mapper.one pages, blog posts, trail guides, industry pages, comparisons, and community maps.",
    canonical: `${origin}/sitemap`,
    ogImage: `${origin}/opengraph.jpg`,
    body,
  }));
});

router.get("/sitemap.xml", async (req, res): Promise<void> => {
  const origin = originFor(req);
  const section = typeof req.query.section === "string" ? req.query.section : null;
  const requestedPage = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const today = dateOnly(new Date());

  res.setHeader("Cache-Control", "no-store");

  if (!section) {
    const mapCount = await publicMapSitemapCount();
    const mapSitemapCount = Math.ceil(mapCount / SITEMAP_URL_LIMIT);
    const childSitemaps: SitemapEntry[] = [
      { path: "/sitemap.xml?section=site", updatedAt: today },
      { path: "/sitemap.xml?section=blog", updatedAt: today },
      { path: "/sitemap.xml?section=trails", updatedAt: today },
      ...Array.from({ length: mapSitemapCount }, (_, index) => ({
        path: `/sitemap.xml?section=maps&page=${index + 1}`,
        updatedAt: today,
      })),
    ];
    res.type("application/xml").send(sitemapIndex(origin, childSitemaps));
    return;
  }

  let entries: SitemapEntry[];
  if (section === "site") {
    entries = [...PUBLIC_ROOT_PATHS, ...allSeoPaths(), ...allGuidePaths(), ...allIndustryPaths()]
      .map((path) => ({ path, updatedAt: today }));
  } else if (section === "blog") {
    const blogPosts = await publicBlogSitemapEntries();
    entries = blogPosts.map((post) => ({
      path: `/blog/${encodeURIComponent(post.slug)}`,
      updatedAt: dateOnly(post.createdAt),
    }));
  } else if (section === "trails") {
    const [trailGuides, trailHubs] = await Promise.all([
      publicTrailGuideSitemapEntries(),
      publicTrailHubSitemapEntries(),
    ]);
    entries = [
      ...trailGuides.map((guide) => ({
        path: `/trails/${encodeURIComponent(guide.slug)}`,
        updatedAt: dateOnly(guide.updatedAt),
      })),
      ...trailHubs.map((hub) => ({
        path: `/trails/${encodeURIComponent(hub.slug)}`,
        updatedAt: dateOnly(hub.updatedAt),
      })),
    ];
  } else if (section === "maps") {
    const mapCount = await publicMapSitemapCount();
    const mapSitemapCount = Math.ceil(mapCount / SITEMAP_URL_LIMIT);
    if (page > mapSitemapCount) {
      res.status(404).type("text/plain").send("Sitemap page not found");
      return;
    }
    const maps = await publicMapSitemapEntries({
      limit: SITEMAP_URL_LIMIT,
      offset: (page - 1) * SITEMAP_URL_LIMIT,
    });
    entries = maps.map((map) => ({
      path: `/maps/${encodeURIComponent(map.id)}`,
      updatedAt: dateOnly(map.createdAt),
    }));
  } else {
    res.status(404).type("text/plain").send("Sitemap section not found");
    return;
  }

  res.type("application/xml").send(sitemapUrlset(origin, entries));
});

export default router;
