import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import OpenAI from "openai";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  communityDatasetsTable,
  db,
  tracksTable,
  trailGuidesTable,
  type TrailGuideRow,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  COMMUNITY_MAP_LABEL,
  isCommunityMapSource,
  publicCommunityMapGeoJson,
  publicCommunityMapMetadata,
  redactCommunityMapSourceText,
} from "../lib/communityMapSource";
import { rateLimit } from "../middlewares/rateLimit";
import { escapeHtml, originFor, renderShell } from "../seo/ssrShared";
import { routePreviewPng } from "./maps";

type SourceType = "community_dataset" | "public_track";
type GuideStatus = "queued" | "generating" | "published" | "failed";
type Position = [number, number];
type GuideSectionKey = "overview" | "planning" | "routeNotes" | "safety";
type GuideFaq = { question: string; answer: string; sourceIds?: string[] };
type LegacyGuideContent = Record<GuideSectionKey, string> & {
  about?: string;
  permits?: string;
  whenToHike?: string;
  trailUse?: string;
  landManager?: string;
  endpoints?: string;
  faqs: GuideFaq[];
};
type GuideSource = {
  id?: string;
  label: string;
  url: string;
  retrievedAt: string;
  claimContext?: string;
};
type GuideEvidenceBlock = { text: string; sourceIds: string[] };
type GuideCallout = { title: string; text: string; sourceIds: string[] };
type GuideRouteStep = { title: string; text: string; sourceIds: string[] };
type GuideSourceClaim = { id: string; text: string; evidenceIds: string[] };
type GuidePlanning = {
  permitsAccess?: GuideEvidenceBlock;
  trailhead?: GuideEvidenceBlock;
  whenToHike?: GuideEvidenceBlock;
};
type GuideContentV2 = {
  version: 2;
  research: { status: "complete" | "partial"; notes: string[] };
  hero: {
    eyebrow: string;
    title: string;
    excerpt: string;
    chips: string[];
  };
  scope: {
    label: string;
    summary: string;
    detail: string;
    endpointStatus: "known" | "unknown";
    elevationStatus: "known" | "unknown";
    sourceIds: string[];
  };
  context: {
    heading: string;
    paragraphs: GuideEvidenceBlock[];
    callouts: GuideCallout[];
  };
  routeSteps: GuideRouteStep[];
  planning: GuidePlanning;
  faqs: GuideFaq[];
  sources: GuideSource[];
  claims: GuideSourceClaim[];
};
type GuideContent = LegacyGuideContent | GuideContentV2;
type PublicRoute = {
  sourceType: SourceType;
  sourceId: string;
  name: string;
  description: string | null;
  author: string | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  region: string | null;
  kind: string | null;
  geometry: unknown;
  center: Position | null;
  isCommunityMapSource: boolean;
};
type PublicGuide = { guide: TrailGuideRow; route: PublicRoute; content: GuideContent; sources: GuideSource[] };

const apiRouter: IRouter = Router();
const pageRouter: IRouter = Router();
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5 });
const ADMIN_COOKIE = "mapper_trail_guides";
const MAX_BATCH_SIZE = 100;
const MAX_GENERATION_ATTEMPTS = 3;
const GUIDE_LEASE_MS = 15 * 60_000;
let processingQueue = false;
let openaiClient: OpenAI | null = null;
let queueRecoveryTimer: NodeJS.Timeout | null = null;

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "trail"
  );
}

function guideSlug(name: string, sourceId: string): string {
  return `${slugify(name)}-${sourceId.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase()}`;
}

function routePositions(geometry: unknown): Position[] {
  const output: Position[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      Number.isFinite(value[0]) &&
      typeof value[1] === "number" &&
      Number.isFinite(value[1])
    ) {
      output.push([value[0], value[1]]);
      return;
    }
    for (const child of value) visit(child);
  };
  const collection = geometry as { features?: Array<{ geometry?: { coordinates?: unknown } }> };
  for (const feature of collection?.features ?? []) visit(feature.geometry?.coordinates);
  return output;
}

function centerForGeometry(geometry: unknown): Position | null {
  const positions = routePositions(geometry);
  if (!positions.length) return null;
  const [sumLng, sumLat] = positions.reduce(
    ([lng, lat], [pointLng, pointLat]) => [lng + pointLng, lat + pointLat],
    [0, 0],
  );
  return [sumLng / positions.length, sumLat / positions.length];
}

function trackGeometry(points: unknown, name: string): object {
  const coordinates = Array.isArray(points)
    ? points.flatMap((point) => {
        const value = point as { lat?: unknown; lng?: unknown };
        return typeof value?.lat === "number" && typeof value?.lng === "number"
          ? [[value.lng, value.lat]]
          : [];
      })
    : [];
  return {
    type: "FeatureCollection",
    features: coordinates.length >= 2
      ? [{
          type: "Feature",
          properties: { name, kind: "route" },
          geometry: { type: "LineString", coordinates },
        }]
      : [],
  };
}

function formatDistance(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return "Not available";
  const miles = meters / 1609.344;
  return miles >= 0.1 ? `${miles.toFixed(miles < 10 ? 1 : 0)} mi` : `${Math.round(meters * 3.28084)} ft`;
}

function formatElevation(meters: number | null): string {
  return meters == null || !Number.isFinite(meters) ? "Not available" : `${Math.round(meters * 3.28084).toLocaleString()} ft`;
}

function plainDescription(value: string | null, fallback: string): string {
  const clean = value?.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 300) : fallback;
}

function redactedGuideText(value: string): string {
  return redactCommunityMapSourceText(value) ?? COMMUNITY_MAP_LABEL;
}

function isGuideContentV2(content: GuideContent): content is GuideContentV2 {
  return "version" in content && content.version === 2;
}

function redactedGuideContent(content: GuideContent): GuideContent {
  if (isGuideContentV2(content)) {
    return {
      ...content,
      research: {
        ...content.research,
        notes: content.research.notes.map(redactedGuideText),
      },
      hero: {
        ...content.hero,
        eyebrow: redactedGuideText(content.hero.eyebrow),
        title: redactedGuideText(content.hero.title),
        excerpt: redactedGuideText(content.hero.excerpt),
        chips: content.hero.chips.map(redactedGuideText),
      },
      scope: {
        ...content.scope,
        label: redactedGuideText(content.scope.label),
        summary: redactedGuideText(content.scope.summary),
        detail: redactedGuideText(content.scope.detail),
      },
      context: {
        ...content.context,
        heading: redactedGuideText(content.context.heading),
        paragraphs: content.context.paragraphs.map((block) => ({
          ...block,
          text: redactedGuideText(block.text),
        })),
        callouts: content.context.callouts.map((callout) => ({
          ...callout,
          title: redactedGuideText(callout.title),
          text: redactedGuideText(callout.text),
        })),
      },
      routeSteps: content.routeSteps.map((step) => ({
        ...step,
        title: redactedGuideText(step.title),
        text: redactedGuideText(step.text),
      })),
      planning: Object.fromEntries(
        Object.entries(content.planning).map(([key, block]) => [
          key,
          block ? { ...block, text: redactedGuideText(block.text) } : undefined,
        ]),
      ) as GuidePlanning,
      faqs: content.faqs.map((faq) => ({
        ...faq,
        question: redactedGuideText(faq.question),
        answer: redactedGuideText(faq.answer),
      })),
      claims: content.claims.map((claim) => ({
        ...claim,
        text: redactedGuideText(claim.text),
      })),
    };
  }
  const optional = (
    value: LegacyGuideContent["about"] | LegacyGuideContent["permits"] | LegacyGuideContent["whenToHike"] |
      LegacyGuideContent["trailUse"] | LegacyGuideContent["landManager"] | LegacyGuideContent["endpoints"],
  ): string | undefined => (value ? redactedGuideText(value) : undefined);

  return {
    overview: redactedGuideText(content.overview),
    planning: redactedGuideText(content.planning),
    routeNotes: redactedGuideText(content.routeNotes),
    safety: redactedGuideText(content.safety),
    about: optional(content.about),
    permits: optional(content.permits),
    whenToHike: optional(content.whenToHike),
    trailUse: optional(content.trailUse),
    landManager: optional(content.landManager),
    endpoints: optional(content.endpoints),
    faqs: content.faqs.map((faq) => ({
      question: redactedGuideText(faq.question),
      answer: redactedGuideText(faq.answer),
      sourceIds: faq.sourceIds,
    })),
  };
}

function publicGuideSources(
  value: unknown,
  useCommunityMapLabel: boolean,
): GuideSource[] {
  const sources = asGuideSources(value);
  if (!useCommunityMapLabel) return sources;
  return sources.flatMap((source) =>
    isCommunityMapSource({ description: `${source.label} ${source.url}` })
      ? []
      : [{
          ...source,
          label: redactCommunityMapSourceText(source.label) ?? COMMUNITY_MAP_LABEL,
        }],
  );
}

function displayRegionForDataset(dataset: {
  description: string | null;
  region: string | null;
}): string | null {
  return dataset.description?.includes("[nps-yosemite-example]")
    ? "Yosemite National Park"
    : dataset.region;
}

async function publicRouteForSource(sourceType: SourceType, sourceId: string): Promise<PublicRoute | null> {
  if (sourceType === "community_dataset") {
    const [dataset] = await db
      .select()
      .from(communityDatasetsTable)
      .where(eq(communityDatasetsTable.id, sourceId))
      .limit(1);
    if (!dataset || dataset.distanceMeters == null || dataset.distanceMeters <= 0) return null;
    const metadata = publicCommunityMapMetadata(dataset);
    const geometry = publicCommunityMapGeoJson(dataset.geojson, metadata.isCommunityMapSource);
    return {
      sourceType,
      sourceId: dataset.id,
      name: metadata.isCommunityMapSource
        ? redactCommunityMapSourceText(dataset.name) ?? COMMUNITY_MAP_LABEL
        : dataset.name,
      description: metadata.description,
      author: metadata.author,
      distanceMeters: dataset.distanceMeters,
      elevationGainMeters: dataset.elevationGainMeters,
      region: displayRegionForDataset(dataset),
      kind: dataset.kind,
      geometry,
      center: centerForGeometry(geometry),
      isCommunityMapSource: metadata.isCommunityMapSource,
    };
  }

  const [track] = await db
    .select()
    .from(tracksTable)
    .where(and(eq(tracksTable.id, sourceId), eq(tracksTable.shareVisibility, "public")))
    .limit(1);
  if (!track || track.distanceMeters <= 0) return null;
  const geometry = trackGeometry(track.points, track.name);
  return {
    sourceType,
    sourceId: track.id,
    name: track.name,
    description: track.description,
    author: null,
    distanceMeters: track.distanceMeters,
    elevationGainMeters: null,
    region: null,
    kind: track.kind,
    geometry,
    center: centerForGeometry(geometry),
    isCommunityMapSource: false,
  };
}

function isEligibleRoute(route: PublicRoute | null): route is PublicRoute {
  return Boolean(route && routePositions(route.geometry).length >= 2);
}

function sourceFromKey(value: string): { sourceType: SourceType; sourceId: string } | null {
  const match = /^(community_dataset|public_track):([0-9a-f-]{36})$/i.exec(value);
  if (!match) return null;
  return {
    sourceType: match[1] as SourceType,
    sourceId: match[2],
  };
}

async function eligibleRouteForKey(value: string): Promise<PublicRoute | null> {
  const source = sourceFromKey(value);
  if (!source) return null;
  const route = await publicRouteForSource(source.sourceType, source.sourceId);
  return isEligibleRoute(route) ? route : null;
}

function asGuideContent(value: unknown, sourceCatalog?: GuideSource[]): GuideContent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version === 2) {
    const sourceItems = sourceCatalog ?? asGuideSources(record.sources);
    const sourceIds = new Set(sourceItems.map((source) => source.id).filter((id): id is string => Boolean(id)));
    const validSourceIds = (input: unknown, required = false): string[] | null => {
      if (!Array.isArray(input)) return required ? null : [];
      const ids = [...new Set(input.filter((id): id is string => typeof id === "string" && sourceIds.has(id)))];
      if (required && ids.length === 0) return null;
      return ids.slice(0, 8);
    };
    const textBlock = (input: unknown, required = false): GuideEvidenceBlock | null => {
      if (!input || typeof input !== "object") return required ? null : null;
      const item = input as { text?: unknown; sourceIds?: unknown };
      if (typeof item.text !== "string" || !item.text.trim()) return required ? null : null;
      const ids = validSourceIds(item.sourceIds, required);
      return ids ? { text: item.text.trim().slice(0, 1_400), sourceIds: ids } : null;
    };
    const callout = (input: unknown): GuideCallout | null => {
      if (!input || typeof input !== "object") return null;
      const item = input as { title?: unknown; text?: unknown; sourceIds?: unknown };
      const ids = validSourceIds(item.sourceIds, true);
      return typeof item.title === "string" && item.title.trim() &&
        typeof item.text === "string" && item.text.trim() && ids
        ? { title: item.title.trim().slice(0, 180), text: item.text.trim().slice(0, 1_400), sourceIds: ids }
        : null;
    };
    const hero = record.hero as Record<string, unknown> | undefined;
    const scope = record.scope as Record<string, unknown> | undefined;
    const context = record.context as Record<string, unknown> | undefined;
    const research = record.research as Record<string, unknown> | undefined;
    const planning = record.planning as Record<string, unknown> | undefined;
    const heroChips = Array.isArray(hero?.chips)
      ? hero.chips.flatMap((chip) => typeof chip === "string" && chip.trim() ? [chip.trim().slice(0, 80)] : []).slice(0, 8)
      : [];
    const paragraphs = Array.isArray(context?.paragraphs)
      ? context.paragraphs.flatMap((item) => {
          const parsed = textBlock(item, true);
          return parsed ? [parsed] : [];
        }).slice(0, 8)
      : [];
    const callouts = Array.isArray(context?.callouts)
      ? context.callouts.flatMap((item) => {
          const parsed = callout(item);
          return parsed ? [parsed] : [];
        }).slice(0, 6)
      : [];
    const routeSteps = Array.isArray(record.routeSteps)
      ? record.routeSteps.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const step = item as { title?: unknown; text?: unknown; sourceIds?: unknown };
          const ids = validSourceIds(step.sourceIds, true);
          return typeof step.title === "string" && step.title.trim() &&
            typeof step.text === "string" && step.text.trim() && ids
            ? [{ title: step.title.trim().slice(0, 180), text: step.text.trim().slice(0, 1_400), sourceIds: ids }]
            : [];
        }).slice(0, 8)
      : [];
    const faqs = Array.isArray(record.faqs)
      ? record.faqs.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const faq = item as Partial<GuideFaq>;
          const ids = validSourceIds(faq.sourceIds, true);
          if (typeof faq.question !== "string" || typeof faq.answer !== "string" || !ids) return [];
          const question = faq.question.trim().slice(0, 220);
          const answer = faq.answer.trim().slice(0, 900);
          return question && answer ? [{ question, answer, sourceIds: ids }] : [];
        }).slice(0, 8)
      : [];
    const parsedPlanning: GuidePlanning = {};
    for (const key of ["permitsAccess", "trailhead", "whenToHike"] as const) {
      const block = textBlock(planning?.[key], true);
      if (block && block.sourceIds.some((id) => id.startsWith("official-"))) parsedPlanning[key] = block;
    }
    const claims = Array.isArray(record.claims)
      ? record.claims.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const claim = item as Partial<GuideSourceClaim>;
          const ids = validSourceIds(claim.evidenceIds, true);
          return typeof claim.id === "string" && claim.id.trim() &&
            typeof claim.text === "string" && claim.text.trim() && ids
            ? [{ id: claim.id.trim().slice(0, 80), text: claim.text.trim().slice(0, 500), evidenceIds: ids }]
            : [];
        }).slice(0, 32)
      : [];
    if (
      !sourceItems.length ||
      !hero || typeof hero.eyebrow !== "string" || !hero.eyebrow.trim() ||
      typeof hero.title !== "string" || !hero.title.trim() ||
      typeof hero.excerpt !== "string" || !hero.excerpt.trim() || !heroChips.length ||
      !scope || typeof scope.label !== "string" || !scope.label.trim() ||
      typeof scope.summary !== "string" || !scope.summary.trim() ||
      typeof scope.detail !== "string" || !scope.detail.trim() ||
      (scope.endpointStatus !== "known" && scope.endpointStatus !== "unknown") ||
      (scope.elevationStatus !== "known" && scope.elevationStatus !== "unknown") ||
      !validSourceIds(scope.sourceIds, true) ||
       !context || typeof context.heading !== "string" || !context.heading.trim() ||
       !paragraphs.length ||
      (research?.status !== "complete" && research?.status !== "partial")
    ) {
      return null;
    }
    return {
      version: 2,
      research: {
        status: research.status,
        notes: Array.isArray(research.notes)
          ? research.notes.flatMap((note) => typeof note === "string" && note.trim() ? [note.trim().slice(0, 240)] : []).slice(0, 4)
          : [],
      },
      hero: {
        eyebrow: hero.eyebrow.trim().slice(0, 120),
        title: hero.title.trim().slice(0, 160),
        excerpt: hero.excerpt.trim().slice(0, 260),
        chips: heroChips,
      },
      scope: {
        label: scope.label.trim().slice(0, 120),
        summary: scope.summary.trim().slice(0, 1_000),
        detail: scope.detail.trim().slice(0, 1_400),
        endpointStatus: scope.endpointStatus,
        elevationStatus: scope.elevationStatus,
        sourceIds: validSourceIds(scope.sourceIds, true) ?? [],
      },
      context: {
        heading: context.heading.trim().slice(0, 180),
        paragraphs,
        callouts,
      },
      routeSteps,
      planning: parsedPlanning,
      faqs,
      sources: sourceItems,
      claims,
    };
  }
  const content = value as Partial<Record<
    GuideSectionKey | "about" | "permits" | "whenToHike" | "trailUse" | "landManager" | "endpoints" | "faqs",
    unknown
  >>;
  const keys: GuideSectionKey[] = ["overview", "planning", "routeNotes", "safety"];
  if (keys.some((key) => typeof content[key] !== "string" || !content[key]?.trim())) return null;
  const optionalText = (key: "about" | "permits" | "whenToHike" | "trailUse" | "landManager" | "endpoints") =>
    typeof content[key] === "string" && content[key].trim() ? content[key].trim().slice(0, 1_400) : undefined;
  const faqs = Array.isArray(content.faqs)
    ? content.faqs.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const faq = item as Partial<GuideFaq>;
        if (typeof faq.question !== "string" || typeof faq.answer !== "string") return [];
        const question = faq.question.trim().slice(0, 220);
        const answer = faq.answer.trim().slice(0, 900);
        return question && answer ? [{ question, answer, sourceIds: faq.sourceIds }] : [];
      }).slice(0, 8)
    : [];
  return {
    overview: String(content.overview).trim(),
    planning: String(content.planning).trim(),
    routeNotes: String(content.routeNotes).trim(),
    safety: String(content.safety).trim(),
    about: optionalText("about"),
    permits: optionalText("permits"),
    whenToHike: optionalText("whenToHike"),
    trailUse: optionalText("trailUse"),
    landManager: optionalText("landManager"),
    endpoints: optionalText("endpoints"),
    faqs,
  };
}

function asGuideSources(value: unknown): GuideSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source, index) => {
    const item = source as Partial<GuideSource>;
    if (
      typeof item?.label !== "string" ||
      typeof item.url !== "string" ||
      !/^https:\/\//.test(item.url) ||
      typeof item.retrievedAt !== "string"
    ) {
      return [];
    }
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 80) : `source-${index + 1}`,
      label: item.label.slice(0, 160),
      url: item.url,
      retrievedAt: item.retrievedAt,
      claimContext: typeof item.claimContext === "string" ? item.claimContext.slice(0, 300) : undefined,
    }];
  });
}

async function publicGuideBySlug(slug: string): Promise<PublicGuide | null> {
  const [guide] = await db
    .select()
    .from(trailGuidesTable)
    .where(and(eq(trailGuidesTable.slug, slug), eq(trailGuidesTable.status, "published")))
    .limit(1);
  if (!guide || (guide.sourceType !== "community_dataset" && guide.sourceType !== "public_track")) return null;
  const [route, content] = await Promise.all([
    publicRouteForSource(guide.sourceType, guide.sourceId),
    Promise.resolve(asGuideContent(guide.content)),
  ]);
  if (!route || !content) return null;
  const publicGuide = route.isCommunityMapSource
    ? {
        ...guide,
        title: guide.title ? redactedGuideText(guide.title) : null,
        excerpt: guide.excerpt ? redactedGuideText(guide.excerpt) : null,
      }
    : guide;
  return {
    guide: publicGuide,
    route,
    content: route.isCommunityMapSource ? redactedGuideContent(content) : content,
    sources: publicGuideSources(guide.sources, route.isCommunityMapSource),
  };
}

export async function findPublishedGuideForSource(
  sourceType: SourceType,
  sourceId: string,
): Promise<{ slug: string; title: string } | null> {
  const [guide] = await db
    .select({ slug: trailGuidesTable.slug, title: trailGuidesTable.title })
    .from(trailGuidesTable)
    .where(
      and(
        eq(trailGuidesTable.sourceType, sourceType),
        eq(trailGuidesTable.sourceId, sourceId),
        eq(trailGuidesTable.status, "published"),
      ),
    )
    .limit(1);
  return guide && guide.title ? { slug: guide.slug, title: guide.title } : null;
}

function openai(): OpenAI {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("Replit OpenAI integration is not configured");
  openaiClient = new OpenAI({ apiKey, baseURL });
  return openaiClient;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "mapper.one trail guide research (+https://mapper.one)" },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "mapper.one trail guide research (+https://mapper.one)",
      },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return null;
    return (await response.text()).slice(0, 180_000);
  } catch {
    return null;
  }
}

function webText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrimarySourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".gov") ||
      host === "nps.gov" || host.endsWith(".nps.gov") ||
      host === "fs.usda.gov" || host.endsWith(".fs.usda.gov") ||
      host === "blm.gov" || host.endsWith(".blm.gov") ||
      host === "parks.ca.gov" || host.endsWith(".parks.ca.gov");
  } catch {
    return false;
  }
}

function decodeSearchUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://html.duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    const candidate = redirected ? decodeURIComponent(redirected) : url.toString();
    return candidate.startsWith("https://") ? candidate : null;
  } catch {
    return null;
  }
}

async function officialSearchLinks(query: string): Promise<string[]> {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];
  const links = [...html.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi)]
    .flatMap((match) => decodeSearchUrl(match[1]) ?? [])
    .filter(isPrimarySourceUrl);
  return [...new Set(links)].slice(0, 3);
}

async function fetchOfficialText(url: string): Promise<{ url: string; text: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "mapper.one trail guide research (+https://mapper.one)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok || !isPrimarySourceUrl(response.url)) return null;
    return { url: response.url, text: (await response.text()).slice(0, 180_000) };
  } catch {
    return null;
  }
}

function isRelevantOfficialText(route: PublicRoute, locationLabel: string | null, text: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const candidate = normalize(text);
  const routeTokens = normalize(route.name).split(" ").filter(Boolean);
  const genericTerms = new Set(["trail", "route", "path", "loop", "park", "national", "state", "forest"]);
  const specificTerms = routeTokens.filter((term) => term.length >= 4 && !genericTerms.has(term));
  const routePhrases = [
    routeTokens.join(" "),
    ...routeTokens.slice(0, -1).map((_, index) => routeTokens.slice(index, index + 2).join(" ")),
  ].filter((phrase) => phrase.split(" ").length >= 2 && phrase.split(" ").some((term) => !genericTerms.has(term)));
  if (routePhrases.some((phrase) => candidate.includes(phrase))) return true;

  // A single distinctive route term needs a separate location match. This avoids
  // treating a generic government page that merely mentions "trail" or a state
  // as evidence for this specific mapped record.
  const locationTerms = [route.region, locationLabel]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => normalize(value).split(" "))
    .filter((term) => term.length >= 4 && !specificTerms.includes(term));
  return specificTerms.length === 1 &&
    locationTerms.length > 0 &&
    candidate.includes(specificTerms[0]) &&
    locationTerms.some((term) => candidate.includes(term));
}

type ResearchEvidence = { sourceId: string; text: string };
type RouteResearch = {
  locationLabel: string | null;
  evidence: ResearchEvidence[];
  sources: GuideSource[];
  status: "complete" | "partial";
  notes: string[];
};

async function researchRoute(route: PublicRoute): Promise<{
  locationLabel: string | null;
  evidence: ResearchEvidence[];
  sources: GuideSource[];
  status: "complete" | "partial";
  notes: string[];
}> {
  const retrievedAt = new Date().toISOString();
  const routeRecordUrl = route.sourceType === "community_dataset"
    ? `https://mapper.one/maps/${encodeURIComponent(route.sourceId)}`
    : "https://mapper.one";
  const sources: GuideSource[] = [{
    id: "route-record",
    label: route.isCommunityMapSource ? `${COMMUNITY_MAP_LABEL} route record` : "mapper.one public route record",
    url: routeRecordUrl,
    retrievedAt,
    claimContext: "Mapped distance, displayed geometry, and route provenance.",
  }];
  const evidence: ResearchEvidence[] = [{
    sourceId: "route-record",
    text: `mapper.one route record: name ${route.name}; distance ${formatDistance(route.distanceMeters)}; elevation gain ${formatElevation(route.elevationGainMeters)}; recorded region ${route.region ?? "not recorded"}; route type ${route.kind ?? "not recorded"}.`,
  }];
  const notes: string[] = [];
  let locationLabel: string | null = null;
  if (route.center) {
    const [lng, lat] = route.center;
    const mapUrl = `https://www.openstreetmap.org/#map=13/${lat.toFixed(5)}/${lng.toFixed(5)}`;
    const geocode = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=10`,
    ) as { address?: Record<string, string> } | null;
    const address = geocode?.address ?? {};
    const place = address.city || address.town || address.village || address.county || address.state || address.country;
    const region = address.state || address.country;
    if (place) {
      locationLabel = region && place !== region ? `${place}, ${region}` : place;
      sources.push({
        id: "route-location",
        label: "OpenStreetMap route location",
        url: mapUrl,
        retrievedAt,
        claimContext: "Approximate map location only; not a permit, access, or trailhead source.",
      });
      evidence.push({ sourceId: "route-location", text: `The route geometry is centered near ${locationLabel}.` });
    }
  }

  const candidates = isYosemiteJmt(route)
    ? [
        "https://www.nps.gov/yose/planyourvisit/jmt.htm",
        "https://www.nps.gov/yose/planyourvisit/yosemite-valley-trails.htm",
        "https://www.nps.gov/places/000/mist-trail-and-john-muir-trail-trailhead.htm",
      ]
    : await officialSearchLinks([route.name, route.region ?? locationLabel, "trail planning"].filter(Boolean).join(" "));
  const uniqueCandidates = [...new Set(candidates)].filter(isPrimarySourceUrl).slice(0, 3);
  const pages = await Promise.all(uniqueCandidates.map(async (url, index) => ({
    index,
    page: await fetchOfficialText(url),
  })));
  for (const page of pages) {
    if (!page.page) continue;
    const text = webText(page.page.text).slice(0, 3_000);
    if (!text || !isRelevantOfficialText(route, locationLabel, text)) continue;
    const host = new URL(page.page.url).hostname.replace(/^www\./, "");
    const sourceId = `official-${page.index + 1}`;
    sources.push({
      id: sourceId,
      label: `${host} planning information`,
      url: page.page.url,
      retrievedAt,
      claimContext: "Primary land-manager or government source retrieved for route planning context.",
    });
    evidence.push({ sourceId, text });
  }
  const officialCount = sources.filter((source) => source.id?.startsWith("official-")).length;
  if (!officialCount) notes.push("No current primary-source planning page could be verified during generation; the guide is limited to the mapped route record.");
  return {
    locationLabel,
    evidence,
    sources,
    status: officialCount ? "complete" : "partial",
    notes,
  };
}

async function generateGuide(guide: TrailGuideRow): Promise<void> {
  if (guide.sourceType !== "community_dataset" && guide.sourceType !== "public_track") {
    throw new Error("Guide has an unsupported source type");
  }
  const route = await publicRouteForSource(guide.sourceType, guide.sourceId);
  if (!route) throw new Error("Guide source is no longer public or does not contain a route");

  const research = await researchRoute(route);
  const prompt = [
    "Write a source-grounded, map-first mapper.one trail guide. Use only the route facts and evidence below; do not fill gaps with common knowledge, geometry-derived facts, or search-result guesses.",
    "Return JSON only. It must match this exact versioned contract:",
    `{"version":2,"research":{"status":"complete|partial","notes":["short note"]},"hero":{"eyebrow":"string","title":"string","excerpt":"string","chips":["string"]},"scope":{"label":"string","summary":"string","detail":"string","endpointStatus":"known|unknown","elevationStatus":"known|unknown","sourceIds":["evidence-id"]},"context":{"heading":"string","paragraphs":[{"text":"string","sourceIds":["evidence-id"]}],"callouts":[{"title":"string","text":"string","sourceIds":["evidence-id"]}]},"routeSteps":[{"title":"string","text":"string","sourceIds":["evidence-id"]}],"planning":{"permitsAccess":{"text":"string","sourceIds":["official-id"]},"trailhead":{"text":"string","sourceIds":["official-id"]},"whenToHike":{"text":"string","sourceIds":["official-id"]}},"faqs":[{"question":"string","answer":"string","sourceIds":["evidence-id"]}],"sources":[],"claims":[{"id":"string","text":"string","evidenceIds":["evidence-id"]}]}`,
    "The sources array is supplied by the server; return [] for it. Use only supplied evidence IDs in every sourceIds/evidenceIds list. Every non-route-record claim needs a source. Include 2-8 route steps only when an evidence source explicitly supports each one. Include each planning field only when a primary official-id explicitly supports it; omit unsupported planning fields entirely.",
    "The scope must clearly say this page maps a specific public route record, not automatically a complete named trail. Mark endpoints unknown unless an evidence source explicitly identifies the endpoints for this exact mapped record. Mark elevation unknown unless it is recorded in the route facts; never assign a broader-trail elevation to this geometry.",
    "Do not claim a route is official, maintained, safe, open, accessible, or current. Never invent permits, access, trailheads, conditions, closures, hazards, facilities, seasons, wildlife, scenery, or turn-by-turn directions. If primary research is missing, keep the guide useful by explaining the map record and pointing readers to verify current information.",
    "Use concise, clear editorial prose. The hero is discovery-oriented but should not overpromise. Claims should be short factual statements and cite their supporting evidence.",
    "",
    `Route name: ${route.name}`,
    `Route description: ${route.description ?? "No recorder description was provided."}`,
    `Route distance: ${formatDistance(route.distanceMeters)}`,
    `Elevation gain: ${formatElevation(route.elevationGainMeters)}`,
    `Region recorded for the route: ${route.region ?? "Not recorded"}`,
    `Nearby location lookup: ${research.locationLabel ?? "Not available"}`,
    `Recorder/author: ${route.author ?? "Not provided"}`,
    `Research status: ${research.status}`,
    "Evidence sources and extracted current text:",
    safeJson(research.evidence),
  ].join("\n");

  const completion = await openai().chat.completions.create({
    model: "gpt-5-mini",
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: "You produce source-grounded outdoor planning copy. Follow the supplied facts exactly and return valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let generated: Record<string, unknown>;
  try {
    generated = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned invalid guide JSON");
  }
  const content = asGuideContent({
    ...generated,
    version: 2,
    research: {
      status: research.status,
      notes: research.notes,
    },
    sources: research.sources,
  }, research.sources);
  if (!content || !isGuideContentV2(content)) throw new Error("OpenAI returned an incomplete or unsupported guide contract");
  const scopedContent: GuideContentV2 = {
    ...content,
    hero: {
      ...content.hero,
      title: isYosemiteJmt(route) ? "John Muir Trail — Yosemite Segment" : content.hero.title,
    },
    scope: {
      ...content.scope,
      endpointStatus: "unknown",
      elevationStatus: route.elevationGainMeters == null ? "unknown" : "known",
      summary: `This page represents the ${formatDistance(route.distanceMeters)} mapped route record for ${route.name}. It does not prove that the geometry is identical to every official description that may use the same trail name.`,
      detail: route.elevationGainMeters == null
        ? "Exact named endpoints and elevation gain are not published for this route record. The map shows the supplied public geometry; verify a full itinerary with the relevant land manager."
        : `The map shows the supplied public geometry. Its recorded elevation gain is ${formatElevation(route.elevationGainMeters)}, while exact named endpoints are not asserted from geometry alone.`,
    },
  };
  const generatedTitle = isYosemiteJmt(route)
    ? "John Muir Trail — Yosemite Segment"
    : scopedContent.hero.title.trim()
      ? scopedContent.hero.title.trim().slice(0, 160)
      : route.name;
  const title = route.isCommunityMapSource
    ? redactedGuideText(generatedTitle)
    : generatedTitle;
  const generatedExcerpt = scopedContent.hero.excerpt.trim()
    ? scopedContent.hero.excerpt.trim().slice(0, 220)
    : plainDescription(route.description, `${formatDistance(route.distanceMeters)} route guide for ${route.name}.`);
  const excerpt = route.isCommunityMapSource
    ? redactedGuideText(generatedExcerpt)
    : generatedExcerpt;
  const now = new Date();
  const published = await db
    .update(trailGuidesTable)
    .set({
      status: "published",
      title,
      excerpt,
      content: route.isCommunityMapSource ? redactedGuideContent(scopedContent) : scopedContent,
      sources: research.sources,
      researchFetchedAt: now,
      generatedAt: now,
      publishedAt: now,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(trailGuidesTable.id, guide.id),
        eq(trailGuidesTable.status, "generating"),
        eq(trailGuidesTable.leaseExpiresAt, guide.leaseExpiresAt ?? new Date(0)),
      ),
    )
    .returning({ id: trailGuidesTable.id });
  if (!published.length) {
    throw new Error("Guide generation lease expired before the result could be saved");
  }
}

async function processGuideQueue(): Promise<void> {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (true) {
      const guide = await db.transaction(async (tx) => {
        const now = new Date();
        const [candidate] = await tx
          .select()
          .from(trailGuidesTable)
          .where(
            and(
              eq(trailGuidesTable.status, "queued"),
              or(isNull(trailGuidesTable.queuedAt), lte(trailGuidesTable.queuedAt, now)),
            ),
          )
          .orderBy(asc(trailGuidesTable.queuedAt), asc(trailGuidesTable.createdAt))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!candidate) return null;
        const [claimed] = await tx
          .update(trailGuidesTable)
          .set({
            status: "generating",
            attempts: candidate.attempts + 1,
            leaseExpiresAt: new Date(now.getTime() + GUIDE_LEASE_MS),
            updatedAt: now,
          })
          .where(and(eq(trailGuidesTable.id, candidate.id), eq(trailGuidesTable.status, "queued")))
          .returning();
        return claimed ?? null;
      });
      if (!guide) break;
      try {
        await generateGuide(guide);
        logger.info({ guideId: guide.id, sourceType: guide.sourceType }, "Trail guide published");
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 800) : "Guide generation failed";
        const attempts = guide.attempts + 1;
        const retry = attempts < MAX_GENERATION_ATTEMPTS;
        await db
          .update(trailGuidesTable)
          .set({
            status: retry ? "queued" : "failed",
            lastError: message,
            queuedAt: retry ? new Date(Date.now() + attempts * 1_000) : guide.queuedAt,
            leaseExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(trailGuidesTable.id, guide.id),
              eq(trailGuidesTable.status, "generating"),
              eq(trailGuidesTable.leaseExpiresAt, guide.leaseExpiresAt ?? new Date(0)),
            ),
          );
        logger.warn({ err: error, guideId: guide.id, attempts, retry }, "Trail guide generation failed");
        if (retry) await new Promise((resolve) => setTimeout(resolve, attempts * 1_000));
      }
    }
  } finally {
    processingQueue = false;
  }
}

export function resumeTrailGuideQueue(): void {
  const reclaimExpiredLeases = async (): Promise<void> => {
    const now = new Date();
    const reclaimed = await db
      .update(trailGuidesTable)
      .set({ status: "queued", leaseExpiresAt: null, updatedAt: now })
      .where(
        and(
          eq(trailGuidesTable.status, "generating"),
          or(isNull(trailGuidesTable.leaseExpiresAt), lte(trailGuidesTable.leaseExpiresAt, now)),
        ),
      )
      .returning({ id: trailGuidesTable.id });
    if (reclaimed.length) {
      logger.warn({ reclaimed: reclaimed.length }, "Reclaimed expired trail-guide leases");
    }
    await processGuideQueue();
  };
  void reclaimExpiredLeases().catch((error) => logger.warn({ err: error }, "Unable to resume trail-guide queue"));
  if (!queueRecoveryTimer) {
    queueRecoveryTimer = setInterval(() => {
      void reclaimExpiredLeases().catch((error) => logger.warn({ err: error }, "Unable to recover trail-guide queue"));
    }, 60_000);
    queueRecoveryTimer.unref();
  }
}

function cookieSignature(payload: string): string {
  const key = process.env.SESSION_SECRET;
  if (!key) throw new Error("SESSION_SECRET is required for the trail-guide admin");
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function adminCookie(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60_000 })).toString("base64url");
  return `${payload}.${cookieSignature(payload)}`;
}

function isAdmin(req: Request): boolean {
  const raw = req.cookies?.[ADMIN_COOKIE];
  if (typeof raw !== "string") return false;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  const expected = cookieSignature(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof value.exp === "number" && value.exp > Date.now();
  } catch {
    return false;
  }
}

function secretMatches(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && timingSafeEqual(inputBuffer, expectedBuffer);
}

function requireAdmin(req: Request, res: Response): boolean {
  if (isAdmin(req)) return true;
  res.redirect("/_admin/trail-guides/login");
  return false;
}

function adminShell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · mapper.one</title><style>
  :root{--bg:#f6f4ee;--ink:#282622;--muted:#6b6961;--line:#dedbd1;--card:#fffdf8;--green:#426c4e;--danger:#a94935}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px Inter,system-ui,sans-serif;line-height:1.5}.wrap{max-width:1100px;margin:auto;padding:28px 20px}header{border-bottom:1px solid var(--line);background:var(--card)}header .wrap{display:flex;justify-content:space-between;align-items:center;padding-top:14px;padding-bottom:14px}.brand{font:600 20px Georgia,serif}.muted{color:var(--muted)}h1,h2{font-family:Georgia,serif;line-height:1.1}h1{font-size:clamp(28px,5vw,46px);margin:0 0 10px}h2{font-size:22px;margin:0 0 12px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin:18px 0}.btn{appearance:none;border:0;border-radius:999px;background:var(--green);color:#fff;padding:10px 16px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}input{font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff;width:100%}label{font-weight:700;display:block;margin-bottom:6px}.login{max-width:420px;margin:10vh auto}.notice{padding:10px 12px;border-radius:8px;background:#f5e6df;color:#763d2d}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:760px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.status{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700;background:#e9e6dd}.status.published{background:#dcebdd;color:#285436}.status.failed{background:#f4dfd9;color:#833b29}.status.generating{background:#e8e5bf;color:#665a10}.row-actions{display:flex;gap:8px;align-items:center}.small{font-size:12px}.sticky{position:sticky;bottom:12px;display:flex;gap:10px;align-items:center;background:rgba(255,253,248,.94);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:14px;padding:12px}@media(max-width:600px){.wrap{padding:20px 14px}.card{padding:15px}}</style></head><body>${body}</body></html>`;
}

async function adminEligibleRoutes(query: string): Promise<Array<PublicRoute & { guide?: TrailGuideRow }>> {
  const term = query.trim();
  const textMatch = term ? orLikeDataset(term) : undefined;
  const [datasets, tracks, guides] = await Promise.all([
    db.select().from(communityDatasetsTable)
      .where(and(isNotNull(communityDatasetsTable.distanceMeters), sql`${communityDatasetsTable.distanceMeters} > 0`, textMatch))
      .orderBy(desc(communityDatasetsTable.createdAt)).limit(180),
    db.select().from(tracksTable)
      .where(and(eq(tracksTable.shareVisibility, "public"), sql`${tracksTable.distanceMeters} > 0`, term ? ilike(tracksTable.name, `%${term}%`) : undefined))
      .orderBy(desc(tracksTable.sharedAt)).limit(180),
    db.select().from(trailGuidesTable),
  ]);
  const guideBySource = new Map(guides.map((guide) => [`${guide.sourceType}:${guide.sourceId}`, guide]));
  return [
    ...datasets.map((dataset) => {
      const route: PublicRoute = {
        sourceType: "community_dataset",
        sourceId: dataset.id,
        name: dataset.name,
        description: dataset.description,
        author: dataset.author,
        distanceMeters: dataset.distanceMeters,
        elevationGainMeters: dataset.elevationGainMeters,
        region: displayRegionForDataset(dataset),
        kind: dataset.kind,
        geometry: dataset.geojson,
        center: centerForGeometry(dataset.geojson),
        isCommunityMapSource: publicCommunityMapMetadata(dataset).isCommunityMapSource,
      };
      return { ...route, guide: guideBySource.get(`community_dataset:${dataset.id}`) };
    }),
    ...tracks.map((track) => {
      const geometry = trackGeometry(track.points, track.name);
      const route: PublicRoute = {
        sourceType: "public_track",
        sourceId: track.id,
        name: track.name,
        description: track.description,
        author: null,
        distanceMeters: track.distanceMeters,
        elevationGainMeters: null,
        region: null,
        kind: track.kind,
        geometry,
        center: centerForGeometry(geometry),
        isCommunityMapSource: false,
      };
      return { ...route, guide: guideBySource.get(`public_track:${track.id}`) };
    }),
  ].filter(isEligibleRoute);
}

function orLikeDataset(term: string) {
  return sql`(${communityDatasetsTable.name} ILIKE ${`%${term}%`} OR ${communityDatasetsTable.description} ILIKE ${`%${term}%`})`;
}

function valuesFromBody(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function adminDashboardHtml(
  routes: Array<PublicRoute & { guide?: TrailGuideRow }>,
  query: string,
): string {
  const rows = routes.map((route) => {
    const guide = route.guide;
    const key = `${route.sourceType}:${route.sourceId}`;
    const researchStatus = guide?.content && typeof guide.content === "object" &&
      (guide.content as { version?: unknown; research?: { status?: unknown } }).version === 2
      ? (guide.content as { research?: { status?: unknown } }).research?.status
      : null;
    return `<tr><td><input aria-label="Select ${escapeHtml(route.name)}" type="checkbox" name="sources" value="${escapeHtml(key)}"></td><td><strong>${escapeHtml(route.name)}</strong><div class="muted small">${escapeHtml(route.region ?? (route.sourceType === "public_track" ? "Public shared track" : "Community route"))}</div></td><td>${escapeHtml(formatDistance(route.distanceMeters))}<br><span class="muted small">${escapeHtml(formatElevation(route.elevationGainMeters))}</span></td><td>${guide ? `<span class="status ${escapeHtml(guide.status)}">${escapeHtml(guide.status)}</span>${researchStatus === "partial" ? '<div class="small" style="color:#8a5a12;margin-top:5px">Research partial — route-record-only copy was published.</div>' : ""}${guide.lastError ? `<div class="small" style="color:var(--danger);margin-top:5px">${escapeHtml(guide.lastError)}</div>` : ""}` : '<span class="status">eligible</span>'}</td><td>${guide?.status === "published" ? `<a class="btn ghost small" href="/trails/${encodeURIComponent(guide.slug)}" target="_blank" rel="noopener">View guide</a>` : ""}</td></tr>`;
  }).join("");
  return adminShell("Trail guide admin", `<header><div class="wrap"><a class="brand" href="/_admin/trail-guides">mapper.one · Trail guides</a><form method="post" action="/_admin/trail-guides/logout"><button class="btn ghost">Sign out</button></form></div></header><main class="wrap"><p class="muted">Owner controls · Published guides are indexable only while their source stays public.</p><h1>Publish enhanced trail guides</h1><p class="muted">Select up to ${MAX_BATCH_SIZE} eligible public community routes or public shared tracks. Generations run one at a time with up to ${MAX_GENERATION_ATTEMPTS} attempts per route.</p><section class="card"><form method="get" action="/_admin/trail-guides"><label for="q">Filter eligible public routes</label><div style="display:flex;gap:8px"><input id="q" name="q" value="${escapeHtml(query)}" placeholder="Search route name or description"><button class="btn ghost">Filter</button></div></form></section><form method="post" action="/_admin/trail-guides/generate"><section class="card"><div class="tablewrap"><table><thead><tr><th></th><th>Public route</th><th>Facts</th><th>Guide status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No eligible public routes match this filter.</td></tr>'}</tbody></table></div></section><div class="sticky"><button class="btn" type="submit">Generate selected guides</button><span class="muted small">Batch cap: ${MAX_BATCH_SIZE}. Refresh this page to see live status.</span></div></form><script>document.querySelector('form[action$=\"/generate\"]').addEventListener('submit',function(e){var chosen=document.querySelectorAll('input[name=\"sources\"]:checked');if(chosen.length===0){e.preventDefault();alert('Select at least one public route.')}if(chosen.length>${MAX_BATCH_SIZE}){e.preventDefault();alert('A batch can include at most ${MAX_BATCH_SIZE} routes.')}});</script></main>`);
}

pageRouter.get("/_admin/trail-guides/login", (req, res) => {
  if (isAdmin(req)) {
    res.redirect("/_admin/trail-guides");
    return;
  }
  const failed = req.query.error === "1";
  res.type("html").send(adminShell("Trail guide admin sign in", `<main class="wrap"><section class="card login"><p class="muted">mapper.one owner controls</p><h1>Trail guide admin</h1>${failed ? '<p class="notice">Sign-in failed. Check the username and password, then try again.</p>' : ""}<form method="post" action="/_admin/trail-guides/login" style="margin-top:18px"><p><label for="username">Username</label><input id="username" name="username" autocomplete="username" required></p><p><label for="password">Password</label><input id="password" type="password" name="password" autocomplete="current-password" required></p><button class="btn">Sign in</button></form></section></main>`));
});

pageRouter.post("/_admin/trail-guides/login", adminLoginLimiter, (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const configured = process.env.TRAIL_GUIDE_ADMIN_PASSWORD;
  const configuredUsername = process.env.TRAIL_GUIDE_ADMIN_USERNAME;
  if (!configured || !configuredUsername || !secretMatches(username, configuredUsername) || !secretMatches(password, configured)) {
    res.redirect("/_admin/trail-guides/login?error=1");
    return;
  }
  res.cookie(ADMIN_COOKIE, adminCookie(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60_000,
    path: "/_admin/trail-guides",
  });
  res.redirect("/_admin/trail-guides");
});

pageRouter.post("/_admin/trail-guides/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { httpOnly: true, sameSite: "strict", path: "/_admin/trail-guides" });
  res.redirect("/_admin/trail-guides/login");
});

pageRouter.get("/_admin/trail-guides", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const query = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : "";
  const routes = await adminEligibleRoutes(query);
  res.setHeader("Cache-Control", "private, no-store");
  res.type("html").send(adminDashboardHtml(routes, query));
});

pageRouter.post("/_admin/trail-guides/generate", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const sources = valuesFromBody(req.body?.sources);
  if (!sources.length || sources.length > MAX_BATCH_SIZE) {
    res.status(400).type("html").send(adminShell("Invalid guide batch", `<main class="wrap"><section class="card"><h1>Invalid guide batch</h1><p>Select between 1 and ${MAX_BATCH_SIZE} routes.</p><a class="btn" href="/_admin/trail-guides">Return to dashboard</a></section></main>`));
    return;
  }
  // Validate each submitted source directly. Rebuilding the dashboard's
  // newest-first, capped list here made a valid selection disappear whenever a
  // background trail import added enough newer records between page load and submit.
  const selected = await Promise.all(sources.map(eligibleRouteForKey));
  if (selected.some((route) => route === null)) {
    res.status(400).type("html").send(adminShell("Guide batch rejected", `<main class="wrap"><section class="card"><h1>One or more routes are no longer eligible.</h1><p>Only routes that are still public and have at least two valid route points can be enhanced. The rest of your selected routes are still available in the refreshed dashboard.</p><a class="btn" href="/_admin/trail-guides">Return to dashboard</a></section></main>`));
    return;
  }
  const eligibleSelected = selected as PublicRoute[];
  const now = new Date();
  for (const route of eligibleSelected) {
    await db.insert(trailGuidesTable).values({
      sourceType: route.sourceType,
      sourceId: route.sourceId,
      slug: guideSlug(route.name, route.sourceId),
      status: "queued",
      queuedAt: now,
      lastError: null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [trailGuidesTable.sourceType, trailGuidesTable.sourceId],
      set: { status: "queued", queuedAt: now, lastError: null, updatedAt: now },
    });
  }
  void processGuideQueue();
  res.redirect("/_admin/trail-guides");
});

apiRouter.get("/trail-guides", async (req, res): Promise<void> => {
  const rows = await db
    .select({ slug: trailGuidesTable.slug, title: trailGuidesTable.title, sourceType: trailGuidesTable.sourceType, sourceId: trailGuidesTable.sourceId })
    .from(trailGuidesTable)
    .where(eq(trailGuidesTable.status, "published"))
    .orderBy(desc(trailGuidesTable.publishedAt))
    .limit(200);
  const guides = (await Promise.all(rows.map(async (row) => {
    if (row.sourceType !== "community_dataset" && row.sourceType !== "public_track") return null;
    const route = await publicRouteForSource(row.sourceType, row.sourceId);
    return route && row.title
      ? {
          slug: row.slug,
          title: route.isCommunityMapSource
            ? redactCommunityMapSourceText(row.title) ?? COMMUNITY_MAP_LABEL
            : row.title,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
        }
      : null;
  }))).filter((guide): guide is NonNullable<typeof guide> => Boolean(guide));
  res.json(guides);
});

apiRouter.get("/trail-guides/:slug/source", async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  const guide = slug ? await publicGuideBySlug(slug) : null;
  if (!guide || guide.route.sourceType !== "community_dataset") {
    res.status(404).json({ error: "This guide does not have an importable public route." });
    return;
  }
  res.json({
    sourceType: guide.route.sourceType,
    datasetId: guide.route.sourceId,
    sourceId: guide.route.sourceId,
    title: guide.route.isCommunityMapSource
      ? redactCommunityMapSourceText(guide.guide.title ?? guide.route.name) ?? COMMUNITY_MAP_LABEL
      : guide.guide.title ?? guide.route.name,
  });
});

apiRouter.post("/trail-guides/:slug/events", async (req, res): Promise<void> => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  const event = typeof req.body?.event === "string" ? req.body.event : "";
  if (!["map_interaction", "app_cta", "app_open"].includes(event) || !slug) {
    res.status(400).json({ error: "Invalid trail-guide event." });
    return;
  }
  const guide = await publicGuideBySlug(slug);
  if (!guide) {
    res.status(404).json({ error: "Trail guide not found." });
    return;
  }
  logger.info({ guideSlug: slug, event }, "Trail guide conversion event");
  res.status(204).end();
});

async function currentPublishedGuides(): Promise<PublicGuide[]> {
  const rows = await db.select().from(trailGuidesTable).where(eq(trailGuidesTable.status, "published")).orderBy(desc(trailGuidesTable.publishedAt));
  const guides = await Promise.all(rows.map(async (guide) => publicGuideBySlug(guide.slug)));
  return guides.filter((guide): guide is PublicGuide => Boolean(guide));
}

type TrailHub = { slug: string; label: string; kind: "State" | "Park" | "County" | "Region"; guides: PublicGuide[] };

function trailHubs(guides: PublicGuide[]): TrailHub[] {
  const hubs = new Map<string, TrailHub>();
  for (const guide of guides) {
    const location = trailLocation(guide.route);
    const places: Array<{ label: string; slug: string; kind: TrailHub["kind"] } | undefined> = [
      location.state && { ...location.state, kind: "State" as const },
      location.park && { ...location.park, kind: "Park" as const },
      location.county && { ...location.county, kind: "County" as const },
      location.fallback && { ...location.fallback, kind: "Region" as const },
    ];
    for (const place of places) {
      if (!place) continue;
      const existing = hubs.get(place.slug);
      if (existing) existing.guides.push(guide);
      else hubs.set(place.slug, { ...place, guides: [guide] });
    }
  }
  return [...hubs.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function conversionTrackingScript(slug: string): string {
  return `<script>(function(){var slug=${safeJson(slug)},sent={};function send(event){if(sent[event])return;sent[event]=true;var payload=JSON.stringify({event:event});var url="/api/trail-guides/"+encodeURIComponent(slug)+"/events";if(navigator.sendBeacon){navigator.sendBeacon(url,new Blob([payload],{type:"application/json"}));return}fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:payload,keepalive:true}).catch(function(){})}window.addEventListener("mapper:trail-map-interaction",function(){send("map_interaction")});document.querySelectorAll("[data-trail-event='app-cta']").forEach(function(link){link.addEventListener("click",function(){send("app_cta")})});document.querySelectorAll("[data-trail-event='app-open']").forEach(function(link){link.addEventListener("click",function(){send("app_open")})})})();</script>`;
}

function renderTrailHub(req: Request, res: Response, hub: TrailHub): void {
  const origin = originFor(req);
  const canonical = `${origin}/trails/${encodeURIComponent(hub.slug)}`;
  const body = `${trailStyles()}<section class="trail-hero"><div class="wrap"><p class="crumbs"><a href="/trails">Trail guides</a> <span aria-hidden="true">/</span> ${escapeHtml(hub.label)}</p><p class="eyebrow">${escapeHtml(hub.kind)} trail hub</p><h1>${escapeHtml(hub.label)} trail maps and route guides</h1><p class="lead trail-hub-intro">Explore source-linked public trail maps in ${escapeHtml(hub.label)}. Open a route on the web first, then take it with you in the free mapper.one app.</p><div class="cta-row"><a class="btn" href="/#get-app">Get mapper.one free</a><a class="btn outline" href="/trails">Browse all trail guides</a></div></div></section><main class="trail-index"><div class="wrap"><div class="trail-grid">${hub.guides.map(trailCard).join("")}</div></div></main>`;
  const schema = [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${hub.label} trail maps and route guides`,
    description: `Public trail maps and route guides for ${hub.label}.`,
    url: canonical,
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trail guides", item: `${origin}/trails` },
      { "@type": "ListItem", position: 2, name: hub.label, item: canonical },
    ],
  }];
  // Rendered from the current set of owner-published guides, so use the same
  // short cache policy as individual guide pages.
  res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=86400");
  res.type("html").send(renderShell({
    title: `${hub.label} Trails: Maps & Route Guides | mapper.one`,
    description: `Explore ${hub.guides.length} public trail map${hub.guides.length === 1 ? "" : "s"} and route guide${hub.guides.length === 1 ? "" : "s"} for ${hub.label}.`,
    canonical,
    ogImage: `${origin}/opengraph.jpg`,
    schema,
    body,
  }));
}

function parsedBrowserLocation(req: Request): Position | null {
  const lat = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
  const lng = typeof req.query.lng === "string" ? Number(req.query.lng) : NaN;
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? [lng, lat] : null;
}

async function coarseIpLocation(req: Request): Promise<Position | null> {
  const ip = req.ip;
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return null;
  const result = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`) as { latitude?: unknown; longitude?: unknown } | null;
  return typeof result?.longitude === "number" && typeof result.latitude === "number"
    ? [result.longitude, result.latitude]
    : null;
}

function scoreDistance(a: Position | null, b: Position | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lngScale = Math.cos((a[1] * Math.PI) / 180);
  return (a[1] - b[1]) ** 2 + ((a[0] - b[0]) * lngScale) ** 2;
}

type TrailLocation = {
  state?: { label: string; slug: string };
  park?: { label: string; slug: string };
  county?: { label: string; slug: string };
  fallback?: { label: string; slug: string };
};

function isYosemiteJmt(route: PublicRoute): boolean {
  return /john\s+muir\s+trail/i.test(route.name) &&
    (route.region === "Yosemite National Park" || route.description?.includes("[nps-yosemite-example]") === true);
}

function trailLocation(route: PublicRoute): TrailLocation {
  if (route.region === "Yosemite National Park" || route.description?.includes("[nps-yosemite-example]")) {
    return {
      state: { label: "California", slug: "california" },
      park: { label: "Yosemite National Park", slug: "yosemite-national-park" },
      county: { label: "Mariposa County", slug: "mariposa-county" },
    };
  }

  const label = route.region?.trim();
  return label ? { fallback: { label, slug: slugify(label) } } : {};
}

function publishedGuideSources(guide: PublicGuide): GuideSource[] {
  if (isGuideContentV2(guide.content)) {
    return publicGuideSources(guide.content.sources, guide.route.isCommunityMapSource);
  }
  const sources = [...guide.sources];
  return sources;
}

function sectionContext(guide: PublicGuide): string | null {
  if (isGuideContentV2(guide.content)) return guide.content.scope.summary;
  if (!isYosemiteJmt(guide.route)) {
    return guide.content.about ??
      `This page represents the ${formatDistance(guide.route.distanceMeters)} public route record published for ${guide.guide.title ?? guide.route.name}. Treat the mapped geometry as this specific record, not as a complete trail network.`;
  }
  return `This ${formatDistance(guide.route.distanceMeters)} map represents an NPS Public Trails route within Yosemite National Park, not the complete John Muir Trail. The full John Muir Trail is approximately 211 miles from Happy Isles in Yosemite Valley to Mount Whitney; this page focuses only on the mapped Yosemite segment represented by the public dataset.`;
}

function trailUseForGuide(guide: PublicGuide): string | undefined {
  if (isGuideContentV2(guide.content)) {
    return guide.content.hero.chips.find((chip) => /hike|bike|horse|ski|paddle|walk/i.test(chip));
  }
  if (guide.content.trailUse) return guide.content.trailUse;
  return isYosemiteJmt(guide.route) ? "Hiking and backpacking" : undefined;
}

function landManagerForGuide(guide: PublicGuide): string | undefined {
  if (isGuideContentV2(guide.content)) return undefined;
  if (guide.content.landManager) return guide.content.landManager;
  return isYosemiteJmt(guide.route) ? "National Park Service" : undefined;
}

function trailFact(label: string, value: string): string {
  return `<div class="trail-fact"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function guideFaqs(guide: PublicGuide, title: string): GuideFaq[] {
  if (isGuideContentV2(guide.content)) return guide.content.faqs;
  const route = guide.route;
  const distance = formatDistance(route.distanceMeters);
  const baseline: GuideFaq[] = [
    {
      question: `How long is the ${title} route on this page?`,
      answer: `The mapped route on this page is ${distance}. Distance is calculated from the published route geometry.`,
    },
    {
      question: `Is this the entire ${title}?`,
      answer: isYosemiteJmt(route)
        ? `No. This page shows a ${distance} NPS Public Trails route within Yosemite National Park. The complete John Muir Trail is a separate, much longer route from Yosemite Valley to Mount Whitney.`
        : `This page represents the public route geometry published for ${title}. Confirm the scope and current route details with the land manager before treating it as a complete trail network.`,
    },
    {
      question: `Is there a map for this route?`,
      answer: `Yes. The interactive map above shows the public route geometry. You can also open this route in the free mapper.one app to carry the map on your phone.`,
    },
    {
      question: "Where can I check permits, closures, and current conditions?",
      answer: "Requirements and conditions can change. Use the official sources below and the relevant land manager before you leave; the mapped route alone does not establish current access rules.",
    },
    {
      question: "What does this mapped route represent?",
      answer: `This page describes the ${distance} public route record published for ${title}. Check the route scope and official sources before using it as a complete trail plan.`,
    },
  ];
  if (isYosemiteJmt(route)) {
    baseline.splice(2, 0, {
      question: "Do I need a permit for this John Muir Trail section?",
      answer: "Overnight wilderness trips in Yosemite require a wilderness permit. Requirements and quotas depend on the starting trailhead and managing agency, so confirm current details with Yosemite National Park before departure.",
    });
  }
  const supplied = guide.content.faqs.filter((faq) => !baseline.some((item) => item.question === faq.question));
  return [...supplied, ...baseline].slice(0, 8);
}

function sourceReference(sourceIds: string[] | undefined, sources: GuideSource[]): string {
  if (!sourceIds?.length) return "";
  const labels = sources
    .filter((source) => source.id && sourceIds.includes(source.id))
    .map((source) => source.label)
    .slice(0, 2);
  return labels.length
    ? `<p class="trail-source-ref">Source${labels.length === 1 ? "" : "s"}: ${escapeHtml(labels.join(" · "))}</p>`
    : "";
}

function hubBreadcrumbs(location: TrailLocation, canonical: string, title: string): Array<{ name: string; item: string }> {
  const entries = [{ name: "Trail guides", item: canonical.replace(/\/trails\/[^/]+$/, "/trails") }];
  for (const place of [location.state, location.park, location.county, location.fallback]) {
    if (place) entries.push({ name: place.label, item: `${entries[0].item}/${place.slug}` });
  }
  entries.push({ name: title, item: canonical });
  return entries;
}

function trailCard(guide: PublicGuide): string {
  return `<a class="trail-card" href="/trails/${encodeURIComponent(guide.guide.slug)}"><span class="trail-star" aria-hidden="true">★</span><p class="eyebrow">Enhanced trail guide</p><h2>${escapeHtml(guide.guide.title ?? guide.route.name)}</h2><p>${escapeHtml(guide.guide.excerpt ?? plainDescription(guide.route.description, "A public mapper.one route guide."))}</p><div class="trail-card-meta">${escapeHtml(formatDistance(guide.route.distanceMeters))}<span>·</span>${escapeHtml(formatElevation(guide.route.elevationGainMeters))}${guide.route.region ? `<span>·</span>${escapeHtml(guide.route.region)}` : ""}</div></a>`;
}

function trailStyles(): string {
  return `<style>
  .trail-index{padding:3rem 0 5rem}.trail-hero{padding:4.5rem 0 3rem;background:linear-gradient(145deg,#e6ede1,var(--background) 65%);border-bottom:1px solid var(--border)}.trail-hero h1{font-size:clamp(2.6rem,6vw,5rem);max-width:12ch;margin:.7rem 0 1rem}.trail-hero .lead,.trail-hub-intro{max-width:45rem}.trail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.trail-card{position:relative;display:block;border:1px solid var(--border);background:var(--card);border-radius:1rem;padding:1.3rem;min-height:15rem;transition:transform .18s,box-shadow .18s}.trail-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(25,35,24,.45)}.trail-card h2{font-size:1.45rem;margin:.55rem 0}.trail-card p{color:var(--muted-foreground);font-size:.92rem}.trail-star{position:absolute;right:1rem;top:1rem;color:#b66e38;font-size:1.15rem}.trail-card-meta{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:1.25rem;font-family:var(--font-mono);font-size:.7rem;color:var(--primary)}.location-button{margin-top:1.25rem}
  .trail-page{--guide-ink:#172018;--guide-paper:#f4f1e8;--guide-forest:#274d38;--guide-deep:#173526;--guide-lime:#c8ef77;--guide-orange:#e97847;--guide-muted:#626a61;--guide-line:rgba(23,32,24,.16);background:var(--guide-paper);color:var(--guide-ink);padding-bottom:5.5rem}.trail-page .wrap{max-width:1180px}.trail-guide-header{position:sticky;top:0;z-index:30;background:rgba(244,241,232,.93);backdrop-filter:blur(14px);border-bottom:1px solid var(--guide-line)}.trail-guide-nav{height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}.trail-guide-brand{font-weight:850;text-decoration:none;letter-spacing:-.02em}.trail-guide-links{display:flex;align-items:center;gap:1.15rem;font-size:.84rem;font-weight:700}.trail-guide-links a{text-decoration:none}.trail-guide-links .trail-nav-cta{color:#fff;background:var(--guide-ink);padding:.6rem .85rem;border-radius:999px}.trail-guide-hero{padding:3.5rem 0 1.8rem}.trail-guide-crumbs{font-size:.82rem;color:var(--guide-muted);margin:0 0 1.4rem}.trail-guide-crumbs a{color:inherit}.trail-guide-hero-grid{display:grid;grid-template-columns:1.12fr .88fr;gap:3rem;align-items:end}.trail-guide-eyebrow{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;font-weight:850;color:var(--guide-forest);margin:0}.trail-guide-hero h1{font-family:Georgia,serif;font-size:clamp(3.25rem,7vw,6.25rem);letter-spacing:-.06em;line-height:.89;margin:.55rem 0 1.15rem;max-width:12ch}.trail-guide-dek{font-size:1.1rem;line-height:1.65;color:#435044;max-width:45rem;margin:0}.trail-guide-chips{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1.2rem}.trail-guide-chip{border:1px solid var(--guide-line);border-radius:999px;padding:.43rem .7rem;font-size:.78rem;font-weight:750;background:rgba(255,255,255,.4)}.trail-scope-note{background:var(--guide-deep);color:#f7f6ef;padding:1.35rem;border-radius:1.2rem;box-shadow:0 16px 35px rgba(27,34,28,.16)}.trail-scope-note .trail-guide-eyebrow{color:var(--guide-lime)}.trail-scope-note strong{display:block;font-family:Georgia,serif;font-size:1.45rem;line-height:1.1;margin:.38rem 0 .5rem}.trail-scope-note p:last-child{margin:0;color:#d7e2d8;font-size:.9rem}.trail-map-shell{padding:.2rem 0 1.2rem}.trail-map-card{height:min(68vh,38rem);min-height:30rem;position:relative;overflow:hidden;border:1px solid var(--guide-line);border-radius:1.8rem;background:#d7dfd0;box-shadow:0 18px 42px rgba(27,34,28,.14)}.trail-map{height:100%;width:100%;background:#d7dfd0}.trail-map-overlay{position:absolute;inset:0;z-index:500;pointer-events:none}.trail-map-top,.trail-map-bottom{position:absolute;left:1.1rem;right:1.1rem;display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}.trail-map-top{top:1rem}.trail-map-bottom{bottom:1rem;align-items:flex-end}.trail-map-label,.trail-map-legend{background:rgba(255,254,248,.95);border:1px solid var(--guide-line);border-radius:.9rem;padding:.65rem .75rem;box-shadow:0 8px 20px rgba(23,32,24,.13)}.trail-map-label b{display:block;font-size:.82rem}.trail-map-label span,.trail-map-legend{font-size:.73rem;color:var(--guide-muted)}.trail-map-actions{display:flex;gap:.45rem;pointer-events:auto}.trail-map-action{width:2.45rem;height:2.45rem;border:1px solid var(--guide-line);border-radius:.75rem;background:rgba(255,254,248,.95);font-weight:900;cursor:pointer}.trail-map-open{pointer-events:auto;background:var(--guide-ink);color:#fff;border-radius:.8rem;padding:.75rem .9rem;text-decoration:none;font-size:.82rem;font-weight:850;box-shadow:0 10px 22px rgba(23,32,24,.25)}.trail-fact-strip{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--guide-line);border-bottom:1px solid var(--guide-line);margin:1.2rem 0 4.6rem}.trail-fact{padding:1.25rem;border-right:1px solid var(--guide-line)}.trail-fact:last-child{border-right:0}.trail-fact strong{display:block;font-family:Georgia,serif;font-size:1.15rem;line-height:1.15}.trail-fact span{display:block;margin-top:.25rem;color:var(--guide-muted);font-size:.67rem;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.trail-guide-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:3.6rem;align-items:start}.trail-article{max-width:720px}.trail-article-section{padding:0 0 3.4rem;margin-bottom:3.2rem;border-bottom:1px solid var(--guide-line)}.trail-article h2{font-family:Georgia,serif;font-size:clamp(2rem,4vw,2.7rem);letter-spacing:-.045em;line-height:1.02;margin:.4rem 0 1rem}.trail-article p{font-size:1.02rem;line-height:1.75;color:#3d493f}.trail-callout{background:#fffef8;border:1px solid var(--guide-line);border-radius:1rem;padding:1rem 1.15rem;margin:1.2rem 0}.trail-callout b{display:block;margin-bottom:.25rem}.trail-callout p{font-size:.92rem;margin:0}.trail-route-steps{display:grid;gap:.9rem;margin-top:1.2rem}.trail-route-step{display:grid;grid-template-columns:2.35rem 1fr;gap:.75rem}.trail-route-step-number{height:2.15rem;width:2.15rem;border-radius:50%;display:grid;place-items:center;background:var(--guide-forest);color:white;font-size:.75rem;font-weight:850}.trail-route-step strong{display:block}.trail-route-step p{margin:.12rem 0 0;font-size:.9rem}.trail-source-ref{font-size:.72rem;color:var(--guide-muted);margin-top:.45rem}.trail-guide-aside{position:sticky;top:5.5rem;display:grid;gap:1rem}.trail-app-card{background:var(--guide-ink);color:#fff;border-radius:1.35rem;padding:1.35rem;box-shadow:0 16px 34px rgba(27,34,28,.16)}.trail-app-card .trail-guide-eyebrow{color:var(--guide-lime)}.trail-app-card h2{font-family:Georgia,serif;font-size:1.7rem;line-height:1.04;margin:.35rem 0 .55rem}.trail-app-card p{font-size:.9rem;line-height:1.55;color:#d7ded8;margin:0}.trail-app-card .btn{display:block;text-align:center;margin-top:1rem;background:var(--guide-lime);color:var(--guide-ink);border:0}.trail-aside-card{border:1px solid var(--guide-line);border-radius:1rem;padding:1rem;background:rgba(255,255,255,.36)}.trail-aside-card h3{font-size:.92rem;margin:0 0 .4rem}.trail-aside-card p{font-size:.82rem;line-height:1.5;color:var(--guide-muted);margin:0}.trail-faq{border-top:1px solid var(--guide-line);padding:1rem 0}.trail-faq summary{cursor:pointer;font-weight:800}.trail-faq p{font-size:.93rem;margin:.65rem 0 0}.trail-sources{list-style:none;margin:0;padding:0}.trail-sources li{padding:.85rem 0;border-top:1px solid var(--guide-line)}.trail-sources a{color:var(--guide-forest);font-weight:750;text-decoration:underline;text-underline-offset:3px}.trail-source-context{font-size:.78rem;color:var(--guide-muted);margin:.22rem 0 0}.trail-closing-cta{margin:1.5rem 0 0;background:var(--guide-forest);color:#fff;border-radius:1.7rem;padding:2.35rem;display:grid;grid-template-columns:1fr auto;align-items:center;gap:1.5rem}.trail-closing-cta h2{font-family:Georgia,serif;font-size:clamp(2rem,4vw,3rem);line-height:1;margin:0 0 .5rem}.trail-closing-cta p{margin:0;color:#dce6de}.trail-closing-cta .btn{background:var(--guide-lime);color:var(--guide-ink);border:0;white-space:nowrap}.trail-mobile-cta{display:none}@media(max-width:900px){.trail-guide-hero-grid,.trail-guide-layout,.trail-closing-cta{grid-template-columns:1fr}.trail-guide-aside{position:static;grid-template-columns:repeat(3,1fr)}.trail-fact-strip{grid-template-columns:1fr 1fr}.trail-fact:nth-child(2){border-right:0}.trail-fact:nth-child(-n+2){border-bottom:1px solid var(--guide-line)}}@media(max-width:640px){.trail-guide-nav{height:58px}.trail-guide-links a:not(.trail-nav-cta){display:none}.trail-guide-hero{padding-top:2.2rem}.trail-guide-hero h1{font-size:3.55rem}.trail-map-card{height:52vh;min-height:25rem;border-radius:1.2rem}.trail-map-top,.trail-map-bottom{left:.75rem;right:.75rem;top:.75rem}.trail-map-bottom{top:auto;bottom:.75rem}.trail-map-legend{display:none}.trail-guide-aside{grid-template-columns:1fr}.trail-closing-cta{padding:1.7rem}.trail-mobile-cta{display:flex;position:fixed;z-index:700;left:.75rem;right:.75rem;bottom:.75rem;align-items:center;justify-content:space-between;gap:.75rem;border-radius:1rem;background:var(--guide-ink);color:#fff;padding:.65rem .75rem .65rem 1rem;box-shadow:0 14px 35px rgba(0,0,0,.28)}.trail-mobile-cta p{font-size:.74rem;line-height:1.25;margin:0}.trail-mobile-cta strong{display:block;font-family:Georgia,serif;font-size:.95rem}.trail-mobile-cta .btn{background:var(--guide-lime);color:var(--guide-ink);padding:.55rem .7rem;font-size:.75rem;border:0}.trail-grid{grid-template-columns:1fr}.trail-index{padding-top:2rem}}@media(max-width:420px){.trail-fact{padding:.85rem .7rem}.trail-fact strong{font-size:1rem}}
  </style><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">`;
}

function trailMapScript(geometry: unknown): string {
  return `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script><script>(function(){var data=${safeJson(geometry)};var map=L.map("trail-map",{zoomControl:false,scrollWheelZoom:false});L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);var route=L.geoJSON(data,{style:{color:"#e97847",weight:5,opacity:.94}}).addTo(map);var visible=true;function fit(){if(route.getBounds().isValid())map.fitBounds(route.getBounds(),{padding:[42,42]});else map.setView([20,0],2)}fit();var sent=false;function interacted(){if(sent)return;sent=true;window.dispatchEvent(new Event("mapper:trail-map-interaction"))}map.on("click dragstart zoomstart",interacted);function bind(id,fn){var el=document.getElementById(id);if(el)el.addEventListener("click",function(){fn();interacted()})}bind("trail-map-zoom-in",function(){map.zoomIn()});bind("trail-map-zoom-out",function(){map.zoomOut()});bind("trail-map-fit",fit);bind("trail-map-route-toggle",function(){visible=!visible;if(visible){route.addTo(map)}else{map.removeLayer(route)}})})();</script>`;
}

pageRouter.get("/trails", async (req, res): Promise<void> => {
  const exactLocation = parsedBrowserLocation(req);
  const coarseRequested = req.query.coarse === "1";
  const location = exactLocation ?? (coarseRequested ? await coarseIpLocation(req) : null);
  const guides = await currentPublishedGuides();
  guides.sort((a, b) => scoreDistance(location, a.route.center) - scoreDistance(location, b.route.center));
  const locationCopy = exactLocation
    ? "Showing enhanced public routes nearest your browser-provided location."
    : coarseRequested && location
      ? "Showing enhanced public routes with an approximate network-based location. Your exact location is not stored."
      : "Browse owner-published, source-linked route guides from the mapper.one community.";
  const body = `${trailStyles()}<section class="trail-hero"><div class="wrap"><p class="eyebrow">Public route discovery</p><h1>Trail guides built from the route.</h1><p class="lead">${escapeHtml(locationCopy)}</p><div class="cta-row location-button"><button class="btn outline" id="use-location" type="button">Use my location to sort routes</button>${!exactLocation && !coarseRequested ? '<a class="btn outline" href="/trails?coarse=1">Use approximate location</a>' : ""}<a class="btn outline" href="/_admin/trail-guides/login">Guide admin</a></div><p class="muted small" id="location-note"></p></div></section><main class="trail-index"><div class="wrap"><div class="trail-grid">${guides.length ? guides.map(trailCard).join("") : '<p class="muted">No enhanced trail guides have been published yet.</p>'}</div></div></main><script>document.getElementById("use-location")?.addEventListener("click",function(){var note=document.getElementById("location-note");if(!navigator.geolocation){if(note)note.textContent="Browser location is unavailable. You can use the approximate-location option instead.";return}navigator.geolocation.getCurrentPosition(function(p){location.href="/trails?lat="+encodeURIComponent(p.coords.latitude)+"&lng="+encodeURIComponent(p.coords.longitude)},function(){if(note)note.innerHTML='Location was not shared. <a href="/trails?coarse=1">Use approximate location instead</a>.'},{enableHighAccuracy:false,maximumAge:300000,timeout:10000})})</script>`;
  // The index changes whenever an owner publishes or replaces a guide. Serving
  // an old cached index makes a newly published guide look missing (or keeps a
  // retired example visible), so always render the current list.
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(renderShell({
    title: "Enhanced Trail Guides | mapper.one",
    description: "Source-linked, owner-published trail guides built from public mapper.one routes.",
    canonical: `${originFor(req)}/trails`,
    ogImage: `${originFor(req)}/opengraph.jpg`,
    body,
  }));
});

pageRouter.get("/trails/:slug/open", async (req, res): Promise<void> => {
  const guide = await publicGuideBySlug(req.params.slug);
  if (!guide || guide.route.sourceType !== "community_dataset") {
    res.redirect("/#get-app");
    return;
  }
  const slug = encodeURIComponent(guide.guide.slug);
  const fallback = "/#get-app";
  res.setHeader("Cache-Control", "private, no-store");
  res.type("html").send(renderShell({
    title: `Open ${guide.guide.title ?? guide.route.name} in mapper.one`,
    description: "Open this public trail route in the mapper.one mobile app.",
    canonical: `${originFor(req)}/trails/${slug}/open`,
    ogImage: `${originFor(req)}/opengraph.jpg`,
    robots: "noindex,nofollow",
    body: `<section class="hero"><div class="wrap narrow"><p class="eyebrow">Open in mapper.one</p><h1>Taking the route to your phone…</h1><p class="lead">If mapper.one is installed, it will open this public route. Otherwise you can download the free app.</p><div class="cta-row"><a class="btn" data-trail-event="app-open" href="${fallback}">Get mapper.one free</a><a class="btn outline" href="/trails/${slug}">Return to the trail map</a></div></div></section><script>(function(){var fallback=${safeJson(fallback)};var appUrl=${safeJson(`mobile:///trails/${guide.guide.slug}`)};var left=false;document.addEventListener("visibilitychange",function(){if(document.hidden)left=true});window.location.href=appUrl;window.setTimeout(function(){if(!left)window.location.replace(fallback)},1400)})();</script>${conversionTrackingScript(guide.guide.slug)}`,
  }));
});

pageRouter.get("/trails/:slug", async (req, res): Promise<void> => {
  const guide = await publicGuideBySlug(req.params.slug);
  if (!guide) {
    const hub = trailHubs(await currentPublishedGuides()).find((candidate) => candidate.slug === req.params.slug);
    if (hub) {
      renderTrailHub(req, res, hub);
      return;
    }
    res.status(404).type("html").send(renderShell({
      title: "Trail guide not found | mapper.one",
      description: "This trail guide is not currently available.",
      canonical: `${originFor(req)}/trails/${encodeURIComponent(req.params.slug)}`,
      ogImage: `${originFor(req)}/opengraph.jpg`,
      robots: "noindex,nofollow",
      body: `<section class="hero"><div class="wrap narrow"><p class="eyebrow">Trail guides</p><h1>That guide is not available.</h1><p class="lead">It may be unpublished or its source route is no longer public.</p><div class="cta-row"><a class="btn" href="/trails">Browse trail guides</a></div></div></section>`,
    }));
    return;
  }
  const all = await currentPublishedGuides();
  const related = all
    .filter((item) => item.guide.id !== guide.guide.id)
    .sort((a, b) => {
      const regionMatchA = a.route.region && a.route.region === guide.route.region ? -1 : 0;
      const regionMatchB = b.route.region && b.route.region === guide.route.region ? -1 : 0;
      return regionMatchA - regionMatchB || scoreDistance(guide.route.center, a.route.center) - scoreDistance(guide.route.center, b.route.center);
    })
    .slice(0, 3);
  const v2Content = isGuideContentV2(guide.content) ? guide.content : null;
  const legacyContent = (v2Content ? {} : guide.content) as LegacyGuideContent;
  const title = v2Content
    ? v2Content.hero.title
    : isYosemiteJmt(guide.route)
      ? "John Muir Trail — Yosemite Segment"
      : guide.guide.title ?? guide.route.name;
  const location = trailLocation(guide.route);
  const locationLabel = location.park?.label ?? location.fallback?.label ?? guide.route.region ?? "the mapped area";
  const description = (v2Content ? v2Content.hero.excerpt : guide.guide.excerpt)?.trim() ||
    `View the ${formatDistance(guide.route.distanceMeters)} ${title} route through ${locationLabel}, explore the interactive trail map, and open it in the free mapper.one mapping app.`;
  const canonical = `${originFor(req)}/trails/${encodeURIComponent(guide.guide.slug)}`;
  const sourceMapHref = guide.route.sourceType === "community_dataset" && !guide.route.isCommunityMapSource
    ? `/maps/${encodeURIComponent(guide.route.sourceId)}`
    : null;
  const sourceLabel = guide.route.isCommunityMapSource
    ? COMMUNITY_MAP_LABEL
    : guide.route.sourceType === "community_dataset"
      ? "Community dataset"
      : "Public shared route";
  const sources = publishedGuideSources(guide);
  const faqs = guideFaqs(guide, title);
  const appSupported = guide.route.sourceType === "community_dataset";
  const appHref = appSupported ? `/trails/${encodeURIComponent(guide.guide.slug)}/open` : "/#get-app";
  const appLabel = appSupported ? "Open in mapper.one" : "Download mapper.one";
  const scope = v2Content
    ? v2Content.scope
    : {
        label: "Mapped route record",
        summary: sectionContext(guide) ?? `This page represents the ${formatDistance(guide.route.distanceMeters)} public route record.`,
        detail: guide.route.elevationGainMeters == null
          ? "Exact named endpoints and elevation details are not available in this published route record."
          : `Elevation gain is recorded as ${formatElevation(guide.route.elevationGainMeters)}. Exact named endpoints are not asserted from the geometry alone.`,
        endpointStatus: "unknown" as const,
        elevationStatus: guide.route.elevationGainMeters == null ? "unknown" as const : "known" as const,
        sourceIds: [],
      };
  const contextHeading = v2Content ? v2Content.context.heading : "Route and planning context";
  const contextParagraphs = v2Content
    ? v2Content.context.paragraphs
    : [{ text: legacyContent.routeNotes, sourceIds: [] }];
  const contextCallouts = v2Content ? v2Content.context.callouts : [];
  const routeSteps = v2Content ? v2Content.routeSteps : [];
  const legacyPlanningSections: Array<{ id: string; eyebrow: string; heading: string; block: GuideEvidenceBlock }> = [];
  if (legacyContent.permits) {
    legacyPlanningSections.push({
      id: "permits",
      eyebrow: "Permits & access",
      heading: "Plan access before you go",
      block: { text: legacyContent.permits, sourceIds: [] },
    });
  }
  if (legacyContent.whenToHike) {
    legacyPlanningSections.push({
      id: "timing",
      eyebrow: "Timing",
      heading: "When to plan",
      block: { text: legacyContent.whenToHike, sourceIds: [] },
    });
  }
  if (legacyContent.planning) {
    legacyPlanningSections.unshift({
      id: "planning",
      eyebrow: "Planning notes",
      heading: "Plan your visit",
      block: { text: legacyContent.planning, sourceIds: [] },
    });
  }
  if (legacyContent.safety) {
    legacyPlanningSections.push({
      id: "navigation",
      eyebrow: "Navigation & safety",
      heading: "Use the map with current information",
      block: { text: legacyContent.safety, sourceIds: [] },
    });
  }
  const planningSections: Array<{ id: string; eyebrow: string; heading: string; block: GuideEvidenceBlock }> = v2Content
    ? [
        v2Content.planning.permitsAccess && { id: "permits", eyebrow: "Permits & access", heading: "Plan access before you go", block: v2Content.planning.permitsAccess },
        v2Content.planning.trailhead && { id: "trailhead", eyebrow: "Trailhead note", heading: "Getting to the route", block: v2Content.planning.trailhead },
        v2Content.planning.whenToHike && { id: "timing", eyebrow: "Timing", heading: "Seasonal planning context", block: v2Content.planning.whenToHike },
      ].filter((section): section is { id: string; eyebrow: string; heading: string; block: GuideEvidenceBlock } => Boolean(section))
    : legacyPlanningSections;
  const heroChips = v2Content
    ? v2Content.hero.chips
    : [formatDistance(guide.route.distanceMeters), trailUseForGuide(guide), locationLabel].filter((chip): chip is string => Boolean(chip));
  const researchStatus = v2Content ? v2Content.research.status : "partial";
  const facts = [
    trailFact("Mapped distance", formatDistance(guide.route.distanceMeters)),
    trailFact("Elevation detail", guide.route.elevationGainMeters == null ? "Not available" : formatElevation(guide.route.elevationGainMeters)),
    trailFact("Mapped area", locationLabel),
    trailFact("Route provenance", sourceLabel),
  ].join("");
  const crumbs = hubBreadcrumbs(location, canonical, title);
  const crumbHtml = crumbs.map((crumb, index) => index === crumbs.length - 1
    ? escapeHtml(crumb.name)
    : `<a href="${escapeHtml(new URL(crumb.item).pathname)}">${escapeHtml(crumb.name)}</a> <span aria-hidden="true">/</span>`).join(" ");
  const body = `${trailStyles()}<article class="trail-page">
    <header class="trail-guide-header"><div class="wrap trail-guide-nav"><a class="trail-guide-brand" href="/">mapper.one</a><nav class="trail-guide-links" aria-label="Trail guide navigation"><a href="#guide">Trail guide</a>${planningSections.some((section) => section.id === "permits") ? '<a href="#permits">Permits</a>' : ""}${sources.length ? '<a href="#sources">Sources</a>' : ""}<a class="trail-nav-cta" data-trail-event="app-cta" href="${appHref}">${escapeHtml(appLabel)}</a></nav></div></header>
    <section class="trail-guide-hero"><div class="wrap"><p class="trail-guide-crumbs">${crumbHtml}</p><div class="trail-guide-hero-grid"><div><p class="trail-guide-eyebrow">${escapeHtml(v2Content ? v2Content.hero.eyebrow : "Enhanced trail guide")}</p><h1>${escapeHtml(title)}</h1><p class="trail-guide-dek">${escapeHtml(description)}</p><div class="trail-guide-chips">${heroChips.map((chip) => `<span class="trail-guide-chip">${escapeHtml(chip)}</span>`).join("")}</div></div><aside class="trail-scope-note"><p class="trail-guide-eyebrow">${escapeHtml(scope.label)}</p><strong>${escapeHtml(scope.summary)}</strong><p>${escapeHtml(scope.detail)}</p>${sourceReference(scope.sourceIds, sources)}</aside></div></div></section>
    <section class="trail-map-shell"><div class="wrap"><div class="trail-map-card" aria-labelledby="interactive-map-heading"><div id="trail-map" class="trail-map" role="application" aria-label="Interactive map for ${escapeHtml(title)}"></div><div class="trail-map-overlay"><div class="trail-map-top"><div class="trail-map-label"><b id="interactive-map-heading">${escapeHtml(title)}</b><span>Interactive mapped route record</span></div><div class="trail-map-actions" aria-label="Map controls"><button class="trail-map-action" type="button" id="trail-map-zoom-in" aria-label="Zoom in">+</button><button class="trail-map-action" type="button" id="trail-map-zoom-out" aria-label="Zoom out">−</button><button class="trail-map-action" type="button" id="trail-map-fit" aria-label="Fit mapped route">⌖</button><button class="trail-map-action" type="button" id="trail-map-route-toggle" aria-label="Show or hide mapped route">⌁</button></div></div><div class="trail-map-bottom"><div class="trail-map-legend"><b style="color:var(--guide-orange)">━━</b> mapped geometry · ${escapeHtml(formatDistance(guide.route.distanceMeters))}</div><a class="trail-map-open" data-trail-event="app-cta" href="${appHref}">${escapeHtml(appLabel)} →</a></div></div></div></div></section>
    <div class="wrap"><section class="trail-fact-strip" aria-label="Route facts">${facts}</section><div class="trail-guide-layout" id="guide"><article class="trail-article"><section class="trail-article-section"><p class="trail-guide-eyebrow">Route scope</p><h2>Know what this map represents.</h2><p>${escapeHtml(scope.detail)}</p>${sourceReference(scope.sourceIds, sources)}</section>${!v2Content ? `<section class="trail-article-section"><p class="trail-guide-eyebrow">Map and route record</p><h2>Using this mapped record.</h2><p>${escapeHtml(legacyContent.overview)}</p></section>` : ""}${contextParagraphs.length ? `<section class="trail-article-section"><p class="trail-guide-eyebrow">Trail in context</p><h2>${escapeHtml(contextHeading)}</h2>${contextParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph.text)}</p>${sourceReference(paragraph.sourceIds, sources)}`).join("")}${contextCallouts.map((callout) => `<div class="trail-callout"><b>${escapeHtml(callout.title)}</b><p>${escapeHtml(callout.text)}</p>${sourceReference(callout.sourceIds, sources)}</div>`).join("")}</section>` : ""}${routeSteps.length ? `<section class="trail-article-section"><p class="trail-guide-eyebrow">Route steps</p><h2>What the cited route context describes.</h2><div class="trail-route-steps">${routeSteps.map((step, index) => `<div class="trail-route-step"><span class="trail-route-step-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.text)}</p>${sourceReference(step.sourceIds, sources)}</div></div>`).join("")}</div></section>` : ""}${planningSections.map((section) => `<section id="${escapeHtml(section.id)}" class="trail-article-section"><p class="trail-guide-eyebrow">${escapeHtml(section.eyebrow)}</p><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.block.text)}</p>${sourceReference(section.block.sourceIds, sources)}</section>`).join("")}${faqs.length ? `<section class="trail-article-section"><p class="trail-guide-eyebrow">FAQ</p><h2>${escapeHtml(title)} questions.</h2>${faqs.map((faq) => `<details class="trail-faq"><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p>${sourceReference(faq.sourceIds, sources)}</details>`).join("")}</section>` : ""}${sources.length ? `<section id="sources" class="trail-article-section"><p class="trail-guide-eyebrow">Primary sources</p><h2>Sources behind this guide.</h2><p>This page separates mapper.one’s route record from independently researched context. Check the source directly for changes.</p><ul class="trail-sources">${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a><span class="muted small"> · retrieved ${escapeHtml(new Date(source.retrievedAt).toLocaleDateString("en-US"))}</span>${source.claimContext ? `<p class="trail-source-context">${escapeHtml(source.claimContext)}</p>` : ""}</li>`).join("")}</ul></section>` : ""}</article><aside class="trail-guide-aside"><section class="trail-app-card"><p class="trail-guide-eyebrow">Take the map with you</p><h2>Research here. Carry the route there.</h2><p>${appSupported ? "Open this same public route in mapper.one and keep the mapped geometry close at hand." : "Download mapper.one to take maps with you. This particular public route does not support direct app import yet."}</p><a class="btn" data-trail-event="app-cta" href="${appHref}">${escapeHtml(appLabel)}</a></section><section class="trail-aside-card"><h3>Editorial standard</h3><p>Endpoints, elevation, permits, access, and conditions are never inferred from a route name or geometry alone.</p></section><section class="trail-aside-card"><h3>Research status</h3><p>${researchStatus === "complete" ? "Primary planning sources were retrieved for this guide. Verify them again before departure." : "No current primary planning source was verified during generation. This guide is limited to the published route record."}</p></section>${sourceMapHref ? `<section class="trail-aside-card"><h3>Route provenance</h3><p><a href="${sourceMapHref}">View the public source map</a></p></section>` : ""}</aside></div>${related.length ? `<section style="padding-top:3rem"><p class="trail-guide-eyebrow">Keep exploring</p><h2 style="font-family:Georgia,serif;font-size:2rem;margin:.5rem 0 1rem">Nearby trails</h2><div class="trail-grid">${related.map(trailCard).join("")}</div></section>` : ""}<section class="trail-closing-cta"><div><h2>Carry the trail beyond the browser.</h2><p>${appSupported ? "Open this mapped route in mapper.one and make the trail page the beginning of the trip—not the end of the search." : "Download mapper.one to carry maps on your phone, then return here for this public route record."}</p></div><a class="btn" data-trail-event="app-cta" href="${appHref}">${escapeHtml(appLabel)} →</a></section></div>
    <aside class="trail-mobile-cta"><p><strong>${escapeHtml(title)}</strong>${escapeHtml(formatDistance(guide.route.distanceMeters))} · mapped route</p><a class="btn" data-trail-event="app-cta" href="${appHref}">${appSupported ? "Open in app" : "Get app"}</a></aside>
  </article>${trailMapScript(guide.route.geometry)}${conversionTrackingScript(guide.guide.slug)}`;
  const styledBody = body.replace(
    '<article class="trail-page">',
    '<style>.trail-guide-header{display:none}.trail-app-card h2{color:#f7f6ef}</style><article class="trail-page">',
  );
  const schema = [{
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${title}: Map, Route & Trail Guide`,
    description,
    mainEntityOfPage: canonical,
    about: {
      "@type": "Place",
      name: locationLabel,
      containedInPlace: location.park ? { "@type": "TouristAttraction", name: location.park.label } : undefined,
    },
    isBasedOn: sources.map((source) => source.url),
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.item })),
  }, {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  }];
  res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=86400");
  res.type("html").send(renderShell({
    title: `${title}: Map, Route & Trail Guide | mapper.one`,
    description,
    canonical,
    ogImage: `${originFor(req)}/og/trails/${encodeURIComponent(guide.guide.slug)}.png`,
    ogType: "article",
    schema,
    body: styledBody,
  }));
});

pageRouter.get("/og/trails/:slug.png", async (req, res): Promise<void> => {
  const slug = req.params.slug.replace(/\.png$/, "");
  const guide = await publicGuideBySlug(slug);
  if (!guide) {
    res.status(404).type("text/plain").send("Trail guide not found");
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  res.type("png").send(routePreviewPng(guide.route.geometry));
});

export async function publicTrailGuideSitemapEntries(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const guides = await currentPublishedGuides();
  return guides.map((guide) => ({ slug: guide.guide.slug, updatedAt: guide.guide.updatedAt }));
}

export async function publicTrailHubSitemapEntries(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const guides = await currentPublishedGuides();
  const updatedAt = guides.reduce(
    (latest, guide) => guide.guide.updatedAt > latest ? guide.guide.updatedAt : latest,
    new Date(0),
  );
  return trailHubs(guides).map((hub) => ({ slug: hub.slug, updatedAt }));
}

export { apiRouter as trailGuidesApiRouter, pageRouter as trailGuidesPageRouter };