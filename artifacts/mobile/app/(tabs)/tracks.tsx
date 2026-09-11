import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ElevationProfile from "@/components/ElevationProfile";
import { WEB_BASE_URL } from "@/constants/site";
import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import {
  createDonationCheckout,
  generateBlogPost,
  shareCommunityDataset,
  uploadPhoto,
} from "@/lib/community";
import { useAuth } from "@/lib/auth";
import { shareTrack, unshareTrack } from "@/lib/sync";
import {
  formatDuration,
  trackToFeatureCollection,
} from "@/lib/trackRecording";
import type { Track, TrackPoint } from "@/lib/types";
import { formatDistance, formatElevation } from "@/lib/units";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const PRIVATE_ROUTE_SUGGESTED_DONATION_CENTS = 500;

/** Sum of positive altitude deltas across a track's points, in meters. */
function computeElevationGain(points: TrackPoint[]): number | null {
  let gain = 0;
  let prev: number | null = null;
  for (const p of points) {
    const alt = typeof p.alt === "number" ? p.alt : null;
    if (alt == null) continue;
    if (prev != null && alt > prev) gain += alt - prev;
    prev = alt;
  }
  return gain > 0 ? gain : null;
}

export default function TracksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tracks, waypoints, updateTrack, removeTrack, settings } = useMaps();
  const { isAuthenticated, login, refreshSession } = useAuth();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<Track | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blogBusy, setBlogBusy] = useState(false);
  const [blogStatus, setBlogStatus] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  // Resolve the live track for the open share modal so its share state stays in
  // sync after updateTrack re-renders the list.
  const shareTarget = sharingId
    ? (tracks.find((t) => t.id === sharingId) ?? null)
    : null;
  const shareUrlFor = (token: string): string => `${WEB_BASE_URL}/r/${token}`;
  const openShare = (t: Track) => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Use the mobile app",
        "Sharing links is done from the mapper.one mobile app.",
      );
      return;
    }
    setSharingId(t.id);
  };

  const closeShare = () => {
    if (shareBusy) return;
    setSharingId(null);
  };

  const ensureRouteSharingSession = async (): Promise<boolean> => {
    if (isAuthenticated && (await refreshSession())) return true;
    Alert.alert(
      "Sign in to create a route link",
      "Route links are connected to your mapper.one account so you can manage or revoke them later.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => void login() },
      ],
    );
    return false;
  };

  const doShare = async (t: Track, visibility: "private" | "public") => {
    if (t.points.length < 2) {
      Alert.alert(
        "Route too short",
        "This route doesn't have enough points to share.",
      );
      return;
    }
    if (!(await ensureRouteSharingSession())) return;
    setShareBusy(true);
    try {
      const patch: Partial<Track> = {};
      // A public link must ALSO live in the community library. Publish first so
      // we never mark a link public unless its community entry exists. Guarded
      // by publishedDatasetId so we never double-publish.
      if (visibility === "public" && !t.publishedDatasetId) {
        const created = await shareCommunityDataset({
          name: t.name,
          description: t.description?.trim() || null,
          format: "geojson",
          author: null,
          geojson: trackToFeatureCollection(t),
        });
        patch.publishedDatasetId = created.id;
      }
      const result = await shareTrack(t.id, visibility);
      patch.shareToken = result.token;
      patch.shareVisibility = result.visibility;
      updateTrack(t.id, patch);
      setShareBusy(false);
      await Share.share({ message: result.url, url: result.url });
      if (visibility === "private") {
        Alert.alert(
          "Private link ready",
          "Your permanent private route link is ready. A suggested $5 donation helps cover storage costs, but donating is completely optional.",
          [
            { text: "No thanks", style: "cancel" },
            {
              text: "Donate $5",
              onPress: () => void startPrivateRouteDonation(),
            },
          ],
        );
      }
    } catch (err) {
      setShareBusy(false);
      Alert.alert(
        "Couldn't create link",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const startPrivateRouteDonation = async () => {
    try {
      const { url } = await createDonationCheckout(
        PRIVATE_ROUTE_SUGGESTED_DONATION_CENTS,
      );
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        "Couldn't start donation",
        error instanceof Error
          ? error.message
          : "Couldn't start secure checkout. Please try again from About.",
      );
    }
  };

  const shareExistingLink = async (t: Track) => {
    if (!t.shareToken) return;
    const url = shareUrlFor(t.shareToken);
    await Share.share({ message: url, url });
  };

  const stopSharing = async (t: Track) => {
    setShareBusy(true);
    try {
      await unshareTrack(t.id);
      updateTrack(t.id, { shareToken: null, shareVisibility: null });
      setShareBusy(false);
      setSharingId(null);
    } catch (err) {
      setShareBusy(false);
      Alert.alert(
        "Couldn't stop sharing",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const openPublish = (t: Track) => {
    setTitle(t.name);
    setDescription("");
    setAuthor("");
    setPublishing(t);
  };

  const closePublish = () => {
    if (submitting) return;
    setPublishing(null);
  };

  const submitPublish = async () => {
    if (!publishing) return;
    const name = title.trim();
    if (!name) {
      Alert.alert("Title required", "Give your track a title before publishing.");
      return;
    }
    if (publishing.points.length < 2) {
      Alert.alert(
        "Track too short",
        "This track doesn't have enough points to publish.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const created = await shareCommunityDataset({
        name,
        description: description.trim() || null,
        format: "geojson",
        author: author.trim() || null,
        geojson: trackToFeatureCollection(publishing),
      });
      updateTrack(publishing.id, { publishedDatasetId: created.id });
      setSubmitting(false);
      setPublishing(null);
      Alert.alert(
        "Published",
        `“${name}” is now in the community library. You can now create a blog post from this track.`,
      );
    } catch (err) {
      setSubmitting(false);
      Alert.alert(
        "Couldn't publish",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const createBlogPost = async (track: Track) => {
    if (!track.publishedDatasetId) return;
    if (Platform.OS === "web") {
      Alert.alert(
        "Use the mobile app",
        "Blog posts are generated from the mapper.one mobile app.",
      );
      return;
    }
    if (blogBusy) return;

    const photos = waypoints.filter(
      (w) => w.trackId === track.id && !!w.photoUri,
    );
    // Field notes from waypoints on this track that have no photo — passed to
    // the AI for extra context (e.g. "start of the steep section").
    const fieldNotes = waypoints
      .filter((w) => w.trackId === track.id && !w.photoUri && !!w.notes?.trim())
      .map((w) => (w.notes ?? "").trim());

    setBlogStatus(
      photos.length > 0
        ? `Uploading photos (0/${photos.length})…`
        : "Writing your post…",
    );
    setBlogBusy(true);
    try {
      const imageUrls: string[] = [];
      // Captions stay index-aligned with imageUrls: only push a caption when
      // its photo actually uploaded, so a skipped upload doesn't shift them.
      const imageCaptions: (string | null)[] = [];
      for (let i = 0; i < photos.length; i += 1) {
        setBlogStatus(`Uploading photos (${i + 1}/${photos.length})…`);
        try {
          const url = await uploadPhoto(photos[i].photoUri as string);
          imageUrls.push(url);
          imageCaptions.push((photos[i].notes ?? "").trim() || null);
        } catch {
          // Skip a photo that fails to upload; continue with the rest.
        }
      }

      setBlogStatus("Writing your post…");
      const mid = track.points[Math.floor(track.points.length / 2)];
      const post = await generateBlogPost(track.publishedDatasetId, {
        units: settings.units,
        distanceMeters: track.distanceMeters,
        elevationGainMeters: computeElevationGain(track.points),
        centerLat: mid?.lat ?? null,
        centerLng: mid?.lng ?? null,
        imageUrls,
        imageCaptions,
        fieldNotes,
      });

      setBlogBusy(false);
      setBlogStatus("");

      const webUrl = `${WEB_BASE_URL}/blog/${post.slug}`;
      Alert.alert(
        "Blog post published",
        `“${post.title}” is now live on mapper.one.`,
        [
          { text: "Done", style: "cancel" },
          { text: "Open on web", onPress: () => Linking.openURL(webUrl) },
        ],
      );
    } catch (err) {
      setBlogBusy(false);
      setBlogStatus("");
      Alert.alert(
        "Couldn't create blog post",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const confirmRemove = (t: Track) => {
    Alert.alert("Remove track?", `“${t.name}” will be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeTrack(t.id),
      },
    ]);
  };

  const renderItem = ({ item }: { item: Track }) => {
    const expanded = expandedId === item.id;
    const elevGain = computeElevationGain(item.points);
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() =>
            setExpandedId((prev) => (prev === item.id ? null : item.id))
          }
          style={({ pressed }) => [styles.cardRow, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.cardTitle, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View
                style={[
                  styles.kindBadge,
                  {
                    backgroundColor:
                      item.kind === "plotted" ? colors.secondary : colors.muted,
                  },
                ]}
              >
                <Feather
                  name={item.kind === "plotted" ? "share-2" : "activity"}
                  size={10}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[styles.kindBadgeText, { color: colors.mutedForeground }]}
                >
                  {item.kind === "plotted" ? "Plotted" : "Recorded"}
                </Text>
              </View>
            </View>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              {formatDistance(item.distanceMeters, settings.units)}
              {item.kind === "plotted"
                ? ""
                : ` · ${formatDuration(item.durationMs)}`}{" "}
              · {item.pointCount} pts
              {elevGain != null
                ? ` · ↑ ${formatElevation(elevGain, settings.units)}`
                : ""}
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              {new Date(item.startedAt).toLocaleString()}
            </Text>
          </View>
          <Feather
            name={expanded ? "bar-chart-2" : "bar-chart"}
            size={18}
            color={expanded ? colors.primary : colors.mutedForeground}
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: "/", params: { follow: item.id } })
            }
            hitSlop={10}
            style={({ pressed: p }) => [styles.iconBtn, { opacity: p ? 0.6 : 1 }]}
          >
            <Feather name="navigation" size={18} color={colors.primary} />
          </Pressable>
          {item.kind === "plotted" ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/", params: { edit: item.id } })
              }
              hitSlop={10}
              style={({ pressed: p }) => [
                styles.iconBtn,
                { opacity: p ? 0.6 : 1 },
              ]}
            >
              <Feather name="edit-2" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => openShare(item)}
            hitSlop={10}
            style={({ pressed: p }) => [styles.iconBtn, { opacity: p ? 0.6 : 1 }]}
          >
            <Feather
              name="share-2"
              size={18}
              color={item.shareToken ? colors.accent ?? colors.primary : colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={() => openPublish(item)}
            hitSlop={10}
            style={({ pressed: p }) => [styles.iconBtn, { opacity: p ? 0.6 : 1 }]}
          >
            <Feather name="upload-cloud" size={18} color={colors.primary} />
          </Pressable>
          {item.publishedDatasetId ? (
            <Pressable
              onPress={() => createBlogPost(item)}
              hitSlop={10}
              disabled={blogBusy}
              style={({ pressed: p }) => [
                styles.iconBtn,
                { opacity: blogBusy ? 0.4 : p ? 0.6 : 1 },
              ]}
            >
              <Feather name="edit-3" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => confirmRemove(item)}
            hitSlop={10}
            style={({ pressed: p }) => [styles.iconBtn, { opacity: p ? 0.6 : 1 }]}
          >
            <Feather name="trash-2" size={18} color={colors.destructive} />
          </Pressable>
        </Pressable>
        {expanded && (
          <View style={[styles.profileWrap, { borderTopColor: colors.border }]}>
            <ElevationProfile points={item.points} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + WEB_TOP_INSET + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
            mapper.one
          </Text>
          <Text style={[styles.h1, { color: colors.foreground }]}>Tracks</Text>
        </View>
        <View
          style={[styles.countPill, { backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.countText, { color: colors.foreground }]}>
            {tracks.length}
          </Text>
        </View>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 96,
          gap: 10,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="activity" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No tracks yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Tap the red record button on the map to start a GPS track. Your
              path is saved when you stop.
            </Text>
            <Pressable
              onPress={() => router.push("/")}
              style={({ pressed }) => [
                styles.emptyBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="map" size={16} color={colors.primaryForeground} />
              <Text
                style={[
                  styles.emptyBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Open map
              </Text>
            </Pressable>
          </View>
        }
      />

      <Modal
        visible={publishing !== null}
        transparent
        animationType="fade"
        onRequestClose={closePublish}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Publish to library
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              {publishing
                ? `${formatDistance(publishing.distanceMeters, settings.units)} · ${
                    publishing.pointCount
                  } pts · shared so other mapper.one users can download it.`
                : ""}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Track title"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Description (optional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this route? Terrain, distance, highlights…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  minHeight: 72,
                  textAlignVertical: "top",
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Your handle (optional)
            </Text>
            <TextInput
              value={author}
              onChangeText={setAuthor}
              placeholder="e.g. @yourname"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={closePublish}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.btnText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submitPublish}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Text
                    style={[styles.btnText, { color: colors.primaryForeground }]}
                  >
                    Publish
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={shareTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeShare}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Share this route
            </Text>
            {shareTarget ? (
              <>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                  Choose how {shareTarget.name} should be shared.
                </Text>
                <Pressable
                  testID="public-route-share"
                  onPress={() => doShare(shareTarget, "public")}
                  disabled={shareBusy}
                  style={({ pressed }) => [
                    styles.shareOption,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      opacity: shareBusy ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather name="globe" size={18} color={colors.accent} />
                  <View style={styles.shareOptionText}>
                    <Text style={[styles.shareOptionTitle, { color: colors.foreground }]}>
                      Public route · Free
                    </Text>
                    <Text style={[styles.shareOptionSub, { color: colors.mutedForeground }]}>
                      Add it to the community library and share the public route link.
                    </Text>
                  </View>
                </Pressable>

                {!shareTarget.shareToken ? (
                  <Pressable
                    testID="private-route-share"
                    onPress={() => doShare(shareTarget, "private")}
                    disabled={shareBusy}
                    style={({ pressed }) => [
                      styles.shareOption,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        opacity: shareBusy ? 0.6 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Feather name="lock" size={18} color={colors.primary} />
                    <View style={styles.shareOptionText}>
                      <Text style={[styles.shareOptionTitle, { color: colors.foreground }]}>
                        Private route · Free · Permanent
                      </Text>
                      <Text style={[styles.shareOptionSub, { color: colors.mutedForeground }]}>
                        Create an unlisted, view-only route link. It remains active until you revoke it. A suggested $5 donation helps cover storage.
                      </Text>
                    </View>
                  </Pressable>
                ) : null}

                {shareTarget.shareToken ? (
                  <>
                  <View
                    style={[
                      styles.shareBadge,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    <Feather
                      name={
                        shareTarget.shareVisibility === "public" ? "globe" : "link"
                      }
                      size={14}
                      color={
                        shareTarget.shareVisibility === "public"
                          ? colors.accent
                          : colors.primary
                      }
                    />
                    <Text style={[styles.shareBadgeText, { color: colors.mutedForeground }]}>
                      {shareTarget.shareVisibility === "public"
                        ? "Public route link active"
                        : "Private route link active"}
                    </Text>
                  </View>
                  <Text
                    selectable
                    style={[
                      styles.shareUrl,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                  >
                    {shareUrlFor(shareTarget.shareToken)}
                  </Text>
                  <View style={styles.modalActions}>
                    <Pressable
                      onPress={() => stopSharing(shareTarget)}
                      disabled={shareBusy}
                      style={({ pressed }) => [
                        styles.modalBtn,
                        {
                          borderColor: colors.border,
                          opacity: shareBusy ? 0.6 : pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: colors.foreground }]}>
                          {shareTarget.shareVisibility === "public"
                            ? "Stop public link"
                            : "Revoke private link"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => shareExistingLink(shareTarget)}
                      disabled={shareBusy}
                      style={({ pressed }) => [
                        styles.modalBtn,
                        {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                          opacity: shareBusy ? 0.6 : pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                        Copy or share
                      </Text>
                    </Pressable>
                  </View>
                  </>
                ) : null}

                {shareBusy ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={{ marginTop: 12 }}
                  />
                ) : null}
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={closeShare}
                    disabled={shareBusy}
                    style={({ pressed }) => [
                      styles.modalBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.btnText, { color: colors.foreground }]}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

          </View>
        </View>
      </Modal>

      <Modal visible={blogBusy} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.blogCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.blogStatus, { color: colors.foreground }]}>
              {blogStatus || "Working…"}
            </Text>
            <Text
              style={[
                styles.modalSub,
                { color: colors.mutedForeground, textAlign: "center" },
              ]}
            >
              Writing an AI blog post from your track and photos. This can take a
              moment.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  kicker: { fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.4 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 2 },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 38,
    alignItems: "center",
  },
  countText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardRow: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  swatch: { width: 6, height: 40, borderRadius: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  kindBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, flexShrink: 1 },
  cardMeta: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  iconBtn: { padding: 8 },
  empty: {
    paddingVertical: 56,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, marginTop: 4 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  blogCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  blogStatus: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    textAlign: "center",
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  modalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  fieldLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  shareOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  shareOptionText: { flex: 1, gap: 3 },
  shareOptionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  shareOptionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  shareBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  shareBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  shareUrl: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 12,
  },
});
