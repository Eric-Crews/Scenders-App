import { Feather } from "@expo/vector-icons";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  createFeedbackPost,
  createFeedbackReply,
  getFeedbackPost,
  listFeedbackPosts,
  upvoteFeedbackPost,
  type FeedbackPostSummary,
  type FeedbackReply,
} from "@/lib/community";
import {
  getClientId,
  getDisplayName,
  setDisplayName as persistDisplayName,
} from "@/lib/feedbackIdentity";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DiscussionsScreen() {
  const colors = useColors();

  const [clientId, setClientId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [posts, setPosts] = useState<FeedbackPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (cid: string) => {
    try {
      setError(null);
      const data = await listFeedbackPosts(cid);
      setPosts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load discussions.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [cid, name] = await Promise.all([getClientId(), getDisplayName()]);
      setClientId(cid);
      setDisplayName(name);
      await load(cid);
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(clientId);
    setRefreshing(false);
  }, [clientId, load]);

  const submitPost = useCallback(async () => {
    const name = displayName.trim();
    const t = title.trim();
    if (!name || t.length < 3) {
      setError("Add your name and a title (at least 3 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await persistDisplayName(name);
      await createFeedbackPost({
        authorName: name,
        title: t,
        body: body.trim() ? body.trim() : null,
      });
      setTitle("");
      setBody("");
      setComposeOpen(false);
      await load(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    } finally {
      setSubmitting(false);
    }
  }, [displayName, title, body, clientId, load]);

  const toggleUpvote = useCallback(
    async (post: FeedbackPostSummary) => {
      // Optimistic update.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                voted: !p.voted,
                upvotes: p.upvotes + (p.voted ? -1 : 1),
              }
            : p,
        ),
      );
      try {
        const res = await upvoteFeedbackPost(post.id, clientId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, voted: res.voted, upvotes: res.upvotes }
              : p,
          ),
        );
      } catch {
        // Revert on failure.
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  voted: post.voted,
                  upvotes: post.upvotes,
                }
              : p,
          ),
        );
      }
    },
    [clientId],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Discussions",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>
            Share feedback, request features, and discuss with the community.
            Post anonymously with a display name — no account needed. Links
            aren&rsquo;t allowed.
          </Text>

          <View style={styles.nameRow}>
            <Feather name="user" size={16} color={colors.mutedForeground} />
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor={colors.mutedForeground}
              maxLength={40}
              style={[
                styles.nameInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            />
          </View>

          {composeOpen ? (
            <View
              style={[
                styles.composeCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Title — what's your idea or feedback?"
                placeholderTextColor={colors.mutedForeground}
                maxLength={140}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.mutedForeground}
                maxLength={4000}
                multiline
                style={[
                  styles.input,
                  styles.textarea,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
              <View style={styles.composeActions}>
                <Pressable
                  onPress={() => {
                    setComposeOpen(false);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.ghostBtn,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text
                    style={[styles.ghostBtnText, { color: colors.mutedForeground }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={submitPost}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: submitting ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {submitting ? "Posting…" : "Post"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setComposeOpen(true)}
              style={({ pressed }) => [
                styles.primaryBtn,
                styles.newBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="edit-3" size={16} color={colors.primaryForeground} />
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                New post
              </Text>
            </Pressable>
          )}

          {error ? (
            <Text style={[styles.error, { color: "#dc2626" }]}>{error}</Text>
          ) : null}

          {loading ? (
            <ActivityIndicator
              style={{ marginTop: 32 }}
              color={colors.primary}
            />
          ) : posts.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              No discussions yet. Be the first to post.
            </Text>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  expanded={expandedId === post.id}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === post.id ? null : post.id))
                  }
                  onUpvote={() => toggleUpvote(post)}
                  displayName={displayName}
                  onNeedName={() =>
                    setError("Add your display name above to reply.")
                  }
                  onReplied={() => load(clientId)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PostCard({
  post,
  expanded,
  onToggleExpand,
  onUpvote,
  displayName,
  onNeedName,
  onReplied,
}: {
  post: FeedbackPostSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpvote: () => void;
  displayName: string;
  onNeedName: () => void;
  onReplied: () => void;
}) {
  const colors = useColors();
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoadingReplies(true);
    getFeedbackPost(post.id)
      .then((detail) => {
        if (!cancelled) setReplies(detail.replies);
      })
      .catch(() => {
        if (!cancelled) setReplyError("Failed to load replies.");
      })
      .finally(() => {
        if (!cancelled) setLoadingReplies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, post.id]);

  const sendReply = useCallback(async () => {
    const name = displayName.trim();
    if (!name) {
      onNeedName();
      return;
    }
    if (!replyBody.trim()) return;
    setSending(true);
    setReplyError(null);
    try {
      const reply = await createFeedbackReply(post.id, {
        authorName: name,
        body: replyBody.trim(),
      });
      setReplies((prev) => [...prev, reply]);
      setReplyBody("");
      onReplied();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Failed to reply.");
    } finally {
      setSending(false);
    }
  }, [displayName, replyBody, post.id, onNeedName, onReplied]);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardRow}>
        <Pressable
          onPress={onUpvote}
          style={({ pressed }) => [
            styles.voteBox,
            {
              borderColor: post.voted ? colors.primary : colors.border,
              backgroundColor: post.voted ? colors.primary : "transparent",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name="chevron-up"
            size={18}
            color={post.voted ? colors.primaryForeground : colors.mutedForeground}
          />
          <Text
            style={[
              styles.voteCount,
              {
                color: post.voted
                  ? colors.primaryForeground
                  : colors.foreground,
              },
            ]}
          >
            {post.upvotes}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {post.title}
          </Text>
          {post.body ? (
            <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>
              {post.body}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {post.authorName} · {timeAgo(post.createdAt)}
            </Text>
            <Pressable onPress={onToggleExpand} hitSlop={8}>
              <Text style={[styles.replyToggle, { color: colors.primary }]}>
                <Feather name="message-circle" size={12} />{" "}
                {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {expanded ? (
        <View style={[styles.repliesWrap, { borderTopColor: colors.border }]}>
          {loadingReplies ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            replies.map((r) => (
              <View key={r.id} style={styles.reply}>
                <Text
                  style={[styles.replyMeta, { color: colors.mutedForeground }]}
                >
                  {r.authorName} · {timeAgo(r.createdAt)}
                </Text>
                <Text style={[styles.replyBody, { color: colors.foreground }]}>
                  {r.body}
                </Text>
              </View>
            ))
          )}
          <View style={styles.replyComposeRow}>
            <TextInput
              value={replyBody}
              onChangeText={setReplyBody}
              placeholder="Write a reply…"
              placeholderTextColor={colors.mutedForeground}
              maxLength={2000}
              multiline
              style={[
                styles.input,
                {
                  flex: 1,
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Pressable
              onPress={sendReply}
              disabled={sending}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: sending ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="send" size={16} color={colors.primaryForeground} />
            </Pressable>
          </View>
          {replyError ? (
            <Text style={[styles.error, { color: "#dc2626" }]}>
              {replyError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 64 },
  intro: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  newBtn: { alignSelf: "flex-start", marginTop: 14, gap: 6 },
  composeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  textarea: { minHeight: 84, textAlignVertical: "top" },
  composeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  ghostBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 10 },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  cardRow: { flexDirection: "row", gap: 12 },
  voteBox: {
    width: 46,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 2,
  },
  voteCount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 21 },
  cardBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12 },
  replyToggle: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  repliesWrap: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
    gap: 10,
  },
  reply: { gap: 2 },
  replyMeta: { fontFamily: "Inter_500Medium", fontSize: 11 },
  replyBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  replyComposeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
