import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  feedbackPostsTable,
  feedbackRepliesTable,
  feedbackVotesTable,
} from "@workspace/db";
import {
  CreateFeedbackPostBody,
  CreateFeedbackReplyBody,
  CreateFeedbackReplyParams,
  GetFeedbackPostParams,
  GetFeedbackPostResponse,
  ListFeedbackPostsQueryParams,
  ListFeedbackPostsResponse,
  UpvoteFeedbackPostBody,
  UpvoteFeedbackPostParams,
  UpvoteFeedbackPostResponse,
} from "@workspace/api-zod";
import { containsUrl } from "../lib/contentGuard";
import { rateLimit } from "../middlewares/rateLimit";

const router: IRouter = Router();

// Per-IP write limiter shared across all feedback mutations: posting, replying
// and upvoting. 30 writes/minute is generous for a human and still blunts bots.
const writeLimiter = rateLimit({ windowMs: 60_000, max: 30 });

const LINK_MESSAGE =
  "Links aren't allowed in posts. Please remove any URLs and try again.";

async function replyCounts(
  postIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (postIds.length === 0) return counts;
  const rows = await db
    .select({
      postId: feedbackRepliesTable.postId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(feedbackRepliesTable)
    .where(inArray(feedbackRepliesTable.postId, postIds))
    .groupBy(feedbackRepliesTable.postId);
  for (const row of rows) counts.set(row.postId, row.count);
  return counts;
}

async function votedSet(
  postIds: string[],
  clientId: string | undefined,
): Promise<Set<string>> {
  const voted = new Set<string>();
  if (!clientId || postIds.length === 0) return voted;
  const rows = await db
    .select({ postId: feedbackVotesTable.postId })
    .from(feedbackVotesTable)
    .where(
      and(
        eq(feedbackVotesTable.clientId, clientId),
        inArray(feedbackVotesTable.postId, postIds),
      ),
    );
  for (const row of rows) voted.add(row.postId);
  return voted;
}

router.get("/community/feedback", async (req, res): Promise<void> => {
  const query = ListFeedbackPostsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const posts = await db
    .select()
    .from(feedbackPostsTable)
    .orderBy(desc(feedbackPostsTable.upvotes), desc(feedbackPostsTable.createdAt));

  const ids = posts.map((p) => p.id);
  const [counts, voted] = await Promise.all([
    replyCounts(ids),
    votedSet(ids, query.data.clientId),
  ]);

  const result = posts.map((p) => ({
    id: p.id,
    authorName: p.authorName,
    title: p.title,
    body: p.body,
    upvotes: p.upvotes,
    replyCount: counts.get(p.id) ?? 0,
    voted: voted.has(p.id),
    createdAt: p.createdAt.toISOString(),
  }));

  res.json(ListFeedbackPostsResponse.parse(result));
});

router.post(
  "/community/feedback",
  writeLimiter,
  async (req, res): Promise<void> => {
    const parsed = CreateFeedbackPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { authorName, title, body } = parsed.data;
    if (containsUrl(authorName, title, body)) {
      res.status(400).json({ error: LINK_MESSAGE });
      return;
    }

    const [row] = await db
      .insert(feedbackPostsTable)
      .values({
        authorName: authorName.trim(),
        title: title.trim(),
        body: body?.trim() ? body.trim() : null,
      })
      .returning();

    req.log.info({ id: row?.id }, "Feedback post created");
    res.status(201).json(
      GetFeedbackPostResponse.parse({
        id: row!.id,
        authorName: row!.authorName,
        title: row!.title,
        body: row!.body,
        upvotes: row!.upvotes,
        replyCount: 0,
        voted: false,
        createdAt: row!.createdAt.toISOString(),
        replies: [],
      }),
    );
  },
);

router.get("/community/feedback/:id", async (req, res): Promise<void> => {
  const params = GetFeedbackPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db
    .select()
    .from(feedbackPostsTable)
    .where(eq(feedbackPostsTable.id, params.data.id))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Feedback post not found" });
    return;
  }

  const replies = await db
    .select()
    .from(feedbackRepliesTable)
    .where(eq(feedbackRepliesTable.postId, post.id))
    .orderBy(feedbackRepliesTable.createdAt);

  res.json(
    GetFeedbackPostResponse.parse({
      id: post.id,
      authorName: post.authorName,
      title: post.title,
      body: post.body,
      upvotes: post.upvotes,
      replyCount: replies.length,
      voted: false,
      createdAt: post.createdAt.toISOString(),
      replies: replies.map((r) => ({
        id: r.id,
        postId: r.postId,
        authorName: r.authorName,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  );
});

router.post(
  "/community/feedback/:id/replies",
  writeLimiter,
  async (req, res): Promise<void> => {
    const params = CreateFeedbackReplyParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateFeedbackReplyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { authorName, body } = parsed.data;
    if (containsUrl(authorName, body)) {
      res.status(400).json({ error: LINK_MESSAGE });
      return;
    }

    const [post] = await db
      .select({ id: feedbackPostsTable.id })
      .from(feedbackPostsTable)
      .where(eq(feedbackPostsTable.id, params.data.id))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Feedback post not found" });
      return;
    }

    const [row] = await db
      .insert(feedbackRepliesTable)
      .values({
        postId: post.id,
        authorName: authorName.trim(),
        body: body.trim(),
      })
      .returning();

    req.log.info({ id: row?.id, postId: post.id }, "Feedback reply created");
    res.status(201).json({
      id: row!.id,
      postId: row!.postId,
      authorName: row!.authorName,
      body: row!.body,
      createdAt: row!.createdAt.toISOString(),
    });
  },
);

router.post(
  "/community/feedback/:id/upvote",
  writeLimiter,
  async (req, res): Promise<void> => {
    const params = UpvoteFeedbackPostParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpvoteFeedbackPostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const postId = params.data.id;
    const { clientId } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [post] = await tx
        .select({ id: feedbackPostsTable.id })
        .from(feedbackPostsTable)
        .where(eq(feedbackPostsTable.id, postId))
        .limit(1);
      if (!post) return null;

      const [existing] = await tx
        .select({ id: feedbackVotesTable.id })
        .from(feedbackVotesTable)
        .where(
          and(
            eq(feedbackVotesTable.postId, postId),
            eq(feedbackVotesTable.clientId, clientId),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .delete(feedbackVotesTable)
          .where(
            and(
              eq(feedbackVotesTable.postId, postId),
              eq(feedbackVotesTable.clientId, clientId),
            ),
          );
      } else {
        // onConflictDoNothing makes a concurrent duplicate insert a no-op
        // instead of a unique-constraint 500; the recompute below reconciles
        // the real state regardless of who won the race.
        await tx
          .insert(feedbackVotesTable)
          .values({ postId, clientId })
          .onConflictDoNothing();
      }

      // Recompute the denormalized counter and this client's vote state from the
      // source-of-truth votes so neither can drift, even under concurrent
      // toggles.
      const [{ total }] = await tx
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(feedbackVotesTable)
        .where(eq(feedbackVotesTable.postId, postId));

      const [stillVoted] = await tx
        .select({ id: feedbackVotesTable.id })
        .from(feedbackVotesTable)
        .where(
          and(
            eq(feedbackVotesTable.postId, postId),
            eq(feedbackVotesTable.clientId, clientId),
          ),
        )
        .limit(1);

      await tx
        .update(feedbackPostsTable)
        .set({ upvotes: total })
        .where(eq(feedbackPostsTable.id, postId));

      return { upvotes: total, voted: !!stillVoted };
    });

    if (!result) {
      res.status(404).json({ error: "Feedback post not found" });
      return;
    }

    res.json(UpvoteFeedbackPostResponse.parse(result));
  },
);

export default router;
