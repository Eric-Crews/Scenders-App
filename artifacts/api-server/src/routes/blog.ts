import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import OpenAI from "openai";
import {
  db,
  blogPostsTable,
  communityDatasetsTable,
} from "@workspace/db";
import {
  GenerateBlogPostBody,
  GenerateBlogPostParams,
  GetBlogPostParams,
  GetBlogPostResponse,
  ListBlogPostsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const SUMMARY_COLUMNS = {
  id: blogPostsTable.id,
  slug: blogPostsTable.slug,
  title: blogPostsTable.title,
  excerpt: blogPostsTable.excerpt,
  coverImageUrl: blogPostsTable.coverImageUrl,
  locationName: blogPostsTable.locationName,
  distanceMeters: blogPostsTable.distanceMeters,
  elevationGainMeters: blogPostsTable.elevationGainMeters,
  author: blogPostsTable.author,
  datasetId: blogPostsTable.datasetId,
  createdAt: blogPostsTable.createdAt,
};

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    if (!apiKey || !baseURL) {
      throw new Error("Replit OpenAI integration is not configured");
    }
    openaiClient = new OpenAI({ apiKey, baseURL });
  }
  return openaiClient;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "trip"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Loop until we find a slug that doesn't exist.
  // Bounded by a sane upper limit to avoid runaway queries.
  while (n < 1000) {
    const [existing] = await db
      .select({ id: blogPostsTable.id })
      .from(blogPostsTable)
      .where(eq(blogPostsTable.slug, slug))
      .limit(1);
    if (!existing) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

type Units = "metric" | "imperial";

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

function formatDistance(
  meters: number | null | undefined,
  units: Units,
): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (units === "imperial") {
    const miles = meters / METERS_PER_MILE;
    if (miles >= 0.1) return `${miles.toFixed(1)} mi`;
    return `${Math.round(meters * FEET_PER_METER)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatElevation(
  meters: number | null | undefined,
  units: Units,
): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (units === "imperial") {
    return `${Math.round(meters * FEET_PER_METER)} ft`;
  }
  return `${Math.round(meters)} m`;
}

async function reverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<string | null> {
  if (lat == null || lng == null) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      String(lat),
    )}&lon=${encodeURIComponent(String(lng))}&zoom=12`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "mapper.one/1.0 (+https://mapper.one)",
        Accept: "application/json",
      },
    });
    if (!resp.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = (await resp.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = data.address ?? {};
    const place =
      a.city ||
      a.town ||
      a.village ||
      a.hamlet ||
      a.county ||
      a.state ||
      a.region;
    const region = a.state || a.country;
    if (place && region && place !== region) return `${place}, ${region}`;
    if (place) return place;
    if (data.display_name) return data.display_name;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

router.post(
  "/community/datasets/:id/blog",
  async (req, res): Promise<void> => {
    const params = GenerateBlogPostParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = GenerateBlogPostBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.message }, "Invalid blog payload");
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [dataset] = await db
      .select({
        id: communityDatasetsTable.id,
        name: communityDatasetsTable.name,
        description: communityDatasetsTable.description,
        author: communityDatasetsTable.author,
      })
      .from(communityDatasetsTable)
      .where(eq(communityDatasetsTable.id, params.data.id))
      .limit(1);

    if (!dataset) {
      res.status(404).json({ error: "Dataset not found" });
      return;
    }

    const {
      units = "metric",
      distanceMeters,
      elevationGainMeters,
      centerLat,
      centerLng,
      author,
      imageUrls,
      imageCaptions = [],
      fieldNotes = [],
    } = parsed.data;

    // Keep captions strictly index-aligned with the photos we actually have,
    // so a malformed/non-mobile caller can't mis-caption or leave stray entries.
    const normalizedCaptions: (string | null)[] = imageUrls.map(
      (_, i) => imageCaptions[i] ?? null,
    );

    const locationName = await reverseGeocode(centerLat, centerLng);
    const distanceStr = formatDistance(distanceMeters, units);
    const elevationStr = formatElevation(elevationGainMeters, units);
    const postAuthor = author ?? dataset.author ?? null;

    const facts: string[] = [];
    facts.push(`Track title: ${dataset.name}`);
    if (dataset.description)
      facts.push(`Track description: ${dataset.description}`);
    if (locationName) facts.push(`Location: ${locationName}`);
    if (distanceStr) facts.push(`Total distance: ${distanceStr}`);
    if (elevationStr) facts.push(`Elevation gain: ${elevationStr}`);
    if (postAuthor) facts.push(`Recorded by: ${postAuthor}`);
    facts.push(`Number of photos available: ${imageUrls.length}`);

    // Field notes the recorder captured along the route — both photo captions
    // and notes from waypoints without a photo. These ground the AI in what the
    // person actually observed (e.g. "waterfall along the hike", "steep section").
    const photoNoteLines = normalizedCaptions
      .map((caption, i) =>
        caption && caption.trim()
          ? `Photo ${i + 1} caption: ${caption.trim()}`
          : null,
      )
      .filter((line): line is string => line !== null);
    const trailNoteLines = fieldNotes
      .map((note) => note.trim())
      .filter((note) => note.length > 0)
      .map((note) => `- ${note}`);

    if (photoNoteLines.length > 0) {
      facts.push("Photo captions from the field:");
      facts.push(...photoNoteLines);
    }
    if (trailNoteLines.length > 0) {
      facts.push("Field notes along the route (no photo):");
      facts.push(...trailNoteLines);
    }

    const unitsInstruction =
      units === "imperial"
        ? "Express all distances and elevations in imperial units (miles and feet); the figures in the details are already formatted that way, so match them and never convert to metric. "
        : "Express all distances and elevations in metric units (kilometers and meters); the figures in the details are already formatted that way, so match them and never convert to imperial. ";

    const systemPrompt =
      "You are an outdoor writer for mapper.one, an open-source community map app for the wild places. " +
      "Write informative, third-person blog posts about recorded trips and trails. " +
      "Never use first-person (no 'I' or 'we'); refer to the person who recorded the track in the third person. " +
      "Be factual and grounded only in the details provided — do not invent specific facts, dates, or events not supported by the data. " +
      unitsInstruction +
      "Respond ONLY with a JSON object with keys: title (string, a compelling headline), " +
      "excerpt (string, 1-2 sentence summary under 200 characters), and content (string, the blog body in Markdown with section headings).";

    // Feed up to a few of the trip photos to gpt-4o as vision input so the
    // generated post can describe the scenery the recorder actually saw.
    const VISION_PHOTO_LIMIT = 4;
    const visionPhotos = imageUrls.slice(0, VISION_PHOTO_LIMIT);

    const buildUserContent = (
      withPhotos: boolean,
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] => [
      {
        type: "text",
        text:
          "Write a blog post about this trip using only the following details:\n\n" +
          facts.join("\n") +
          (withPhotos
            ? "\n\nPhotos taken along the route are attached. Use what is actually visible in them " +
              "(terrain, scenery, conditions) to enrich the description, but do not invent details that are not present."
            : "") +
          "\n\nThe blog post should describe the route, its location, distance and elevation, " +
          "and what the experience of following this track is like, written in the third person. " +
          "Use Markdown headings and a few short paragraphs. Do not embed image links in the Markdown — photos are displayed separately.",
      },
      ...(withPhotos
        ? visionPhotos.flatMap(
            (
              url,
              i,
            ): OpenAI.Chat.Completions.ChatCompletionContentPart[] => {
              const caption = normalizedCaptions[i];
              const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
                [];
              if (caption && caption.trim()) {
                parts.push({
                  type: "text",
                  text: `Photo ${i + 1} — field note: ${caption.trim()}`,
                });
              }
              parts.push({
                type: "image_url",
                image_url: { url, detail: "low" },
              });
              return parts;
            },
          )
        : []),
    ];

    const generate = async (withPhotos: boolean): Promise<string> => {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserContent(withPhotos) },
        ],
      });
      return completion.choices[0]?.message?.content ?? "{}";
    };

    let generated: {
      title?: unknown;
      excerpt?: unknown;
      content?: unknown;
    };
    try {
      let raw: string;
      try {
        raw = await generate(visionPhotos.length > 0);
      } catch (visionError) {
        // A single unreachable/invalid photo shouldn't kill the post — fall
        // back to a text-only generation grounded in the track metadata.
        if (visionPhotos.length === 0) throw visionError;
        req.log.warn(
          { err: visionError },
          "Vision blog generation failed; retrying without photos",
        );
        raw = await generate(false);
      }
      generated = JSON.parse(raw) as typeof generated;
    } catch (error) {
      req.log.error({ err: error }, "Blog generation failed");
      res.status(500).json({ error: "Failed to generate blog post" });
      return;
    }

    const title =
      typeof generated.title === "string" && generated.title.trim()
        ? generated.title.trim()
        : dataset.name;
    const content =
      typeof generated.content === "string" && generated.content.trim()
        ? generated.content.trim()
        : "";
    const excerpt =
      typeof generated.excerpt === "string" && generated.excerpt.trim()
        ? generated.excerpt.trim().slice(0, 300)
        : content.replace(/[#*_>`]/g, "").slice(0, 200);

    if (!content) {
      res.status(500).json({ error: "Generated blog post was empty" });
      return;
    }

    const slug = await uniqueSlug(slugify(title));
    const coverImageUrl = imageUrls[0] ?? null;

    const [row] = await db
      .insert(blogPostsTable)
      .values({
        datasetId: dataset.id,
        title,
        slug,
        excerpt,
        content,
        coverImageUrl,
        imageUrls,
        imageCaptions: normalizedCaptions,
        distanceMeters: distanceMeters ?? null,
        elevationGainMeters: elevationGainMeters ?? null,
        locationName,
        author: postAuthor,
      })
      .returning();

    req.log.info({ id: row?.id, slug }, "Blog post created");
    res.status(201).json(GetBlogPostResponse.parse(row));
  },
);

router.get("/blog", async (req, res): Promise<void> => {
  req.log.info("Listing blog posts");
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(blogPostsTable)
    .orderBy(desc(blogPostsTable.createdAt));
  res.json(ListBlogPostsResponse.parse(rows));
});

router.get("/blog/:slug", async (req, res): Promise<void> => {
  const params = GetBlogPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(blogPostsTable)
    .where(eq(blogPostsTable.slug, params.data.slug))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Blog post not found" });
    return;
  }
  res.json(GetBlogPostResponse.parse(row));
});

export async function publicBlogSitemapEntries(): Promise<Array<{ slug: string; createdAt: Date }>> {
  return db
    .select({
      slug: blogPostsTable.slug,
      createdAt: blogPostsTable.createdAt,
    })
    .from(blogPostsTable)
    .orderBy(desc(blogPostsTable.createdAt));
}

export default router;
