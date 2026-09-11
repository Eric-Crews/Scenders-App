import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListFeedbackPosts,
  useCreateFeedbackPost,
  useCreateFeedbackReply,
  useUpvoteFeedbackPost,
  useGetFeedbackPost,
  getListFeedbackPostsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Compass,
  ChevronUp,
  MessageCircle,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

function getClientId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "mapper.one/feedback-client-id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

function getStoredName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("mapper.one/feedback-display-name") ?? "";
}

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Discussions() {
  const clientId = useMemo(getClientId, []);
  const queryClient = useQueryClient();
  const listKey = useMemo(
    () => getListFeedbackPostsQueryKey({ clientId }),
    [clientId],
  );

  const { data: posts, isLoading } = useListFeedbackPosts({ clientId });

  const [displayName, setDisplayName] = useState(getStoredName);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: listKey });

  const createPost = useCreateFeedbackPost({
    mutation: {
      onSuccess: () => {
        setTitle("");
        setBody("");
        setFormError(null);
        invalidate();
      },
      onError: (err) =>
        setFormError(err instanceof Error ? err.message : "Failed to post."),
    },
  });

  const upvote = useUpvoteFeedbackPost({
    mutation: { onSuccess: invalidate },
  });

  const submit = () => {
    const name = displayName.trim();
    const t = title.trim();
    if (!name || t.length < 3) {
      setFormError("Add your name and a title (at least 3 characters).");
      return;
    }
    window.localStorage.setItem("mapper.one/feedback-display-name", name);
    createPost.mutate({
      data: { authorName: name, title: t, body: body.trim() ? body.trim() : null },
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">
              mapper.one
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-4">
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5"
            >
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-10 md:pt-40 md:pb-12 px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-6 border border-border/50">
            <MessageCircle className="w-4 h-4" />
            <span>Community board</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-balance leading-[1.05] mb-4">
            Discussions &amp; feedback
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            Share feedback, request features, and upvote ideas. Post anonymously
            with a display name &mdash; no account needed. Links aren&rsquo;t
            allowed.
          </p>
        </motion.div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          {/* Compose */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-8">
            <div className="grid gap-3">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                maxLength={40}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60"
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title — what's your idea or feedback?"
                maxLength={140}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add details (optional)"
                maxLength={4000}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60 resize-y"
              />
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={submit}
                  disabled={createPost.isPending}
                  className="rounded-full px-6"
                >
                  {createPost.isPending ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="grid gap-4">
              {posts.map((post) => (
                <motion.div
                  key={post.id}
                  initial="hidden"
                  animate="visible"
                  variants={fadeIn}
                  className="bg-card rounded-2xl border border-border shadow-sm p-5"
                >
                  <div className="flex gap-4">
                    <button
                      onClick={() =>
                        upvote.mutate({ id: post.id, data: { clientId } })
                      }
                      className={`flex flex-col items-center justify-center w-12 shrink-0 rounded-xl border py-2 transition-colors ${
                        post.voted
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                      aria-label="Upvote"
                    >
                      <ChevronUp className="w-5 h-5" />
                      <span className="text-sm font-semibold">{post.upvotes}</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif text-lg leading-snug">
                        {post.title}
                      </h3>
                      {post.body && (
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                          {post.body}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground font-mono">
                        <span>
                          {post.authorName} · {timeAgo(post.createdAt)}
                        </span>
                        <button
                          onClick={() =>
                            setExpandedId((id) =>
                              id === post.id ? null : post.id,
                            )
                          }
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {post.replyCount}{" "}
                          {post.replyCount === 1 ? "reply" : "replies"}
                        </button>
                      </div>
                      {expandedId === post.id && (
                        <Replies
                          postId={post.id}
                          displayName={displayName}
                          onReplied={invalidate}
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
              <MessageCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-serif mb-2">No discussions yet</h3>
              <p className="text-muted-foreground font-light">
                Be the first to share feedback or an idea.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Replies({
  postId,
  displayName,
  onReplied,
}: {
  postId: string;
  displayName: string;
  onReplied: () => void;
}) {
  const { data: detail, isLoading, refetch } = useGetFeedbackPost(postId);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reply = useCreateFeedbackReply({
    mutation: {
      onSuccess: () => {
        setBody("");
        setError(null);
        refetch();
        onReplied();
      },
      onError: (err) =>
        setError(err instanceof Error ? err.message : "Failed to reply."),
    },
  });

  const send = () => {
    const name = displayName.trim();
    if (!name) {
      setError("Add your display name above to reply.");
      return;
    }
    if (!body.trim()) return;
    reply.mutate({ id: postId, data: { authorName: name, body: body.trim() } });
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 mb-3">
          {detail?.replies.map((r) => (
            <div key={r.id} className="text-sm">
              <span className="text-xs text-muted-foreground font-mono">
                {r.authorName} · {timeAgo(r.createdAt)}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap">{r.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          maxLength={2000}
          rows={2}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 resize-y"
        />
        <Button
          onClick={send}
          disabled={reply.isPending}
          size="icon"
          className="rounded-lg shrink-0"
          aria-label="Send reply"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}
