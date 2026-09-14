import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScendersMoreButton } from "@/components/ScendersChrome";
import { RideRoutePreview } from "@/components/RideRoutePreview";
import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import {
  getRideGuide,
  rideGuideBounds,
  rideGuideGeoJson,
  rideGuideWebUrl,
  SCENDERS_SHOP_URL,
  type RideGuide,
} from "@/lib/rideForest";

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function editorialText(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    ldquo: "“",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return entities[code.toLowerCase()] ?? entity;
    })
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function RideDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { datasets, addDataset, setActiveOnly } = useMaps();
  const [guide, setGuide] = useState<RideGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      setGuide(await getRideGuide(slug));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "This ride guide is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeroImageFailed(false);
  }, [guide?.id]);

  const savedDataset = useMemo(
    () =>
      guide
        ? (datasets.find(
            (dataset) => dataset.communityId === `rideforest:${guide.id}`,
          ) ?? null)
        : null,
    [datasets, guide],
  );

  const ensureSaved = () => {
    if (!guide || guide.trackCoordinates.length < 2) return null;
    if (savedDataset) return savedDataset;
    const dataset = addDataset(
      guide.title,
      "geojson",
      rideGuideGeoJson(guide),
      rideGuideBounds(guide),
      { communityId: `rideforest:${guide.id}` },
    );
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    return dataset;
  };

  const openOnMap = (follow: boolean) => {
    const dataset = ensureSaved();
    if (!dataset) return;
    setActiveOnly(dataset.id);
    router.push({
      pathname: "/map",
      params: follow ? { followDataset: dataset.id } : { dataset: dataset.id },
    });
  };

  const TopBar = () => (
    <View style={[styles.topBar, { marginTop: insets.top + 10, marginBottom: 16, marginHorizontal: 18 }]}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={[
          styles.iconButton,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.wordmark, { color: colors.primary }]}>
        SCENDERS
      </Text>
      <ScendersMoreButton />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TopBar />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Loading ride…
          </Text>
        </View>
      </View>
    );
  }

  if (error || !guide) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TopBar />
        <View
          style={[
            styles.center,
            { paddingHorizontal: 24 },
          ]}
        >
          <Feather name="map" size={28} color={colors.primary} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            Ride unavailable
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {error || "We couldn’t find this ride."}
          </Text>
          <Pressable
            onPress={() => void load()}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: colors.primaryForeground },
              ]}
            >
              Try again
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const location =
    [guide.city, guide.state].filter(Boolean).join(", ") ||
    guide.location ||
    "Scenders ride guide";
  const description = editorialText(
    guide.generatedDescription ||
      guide.seoDescription ||
      guide.content?.introduction ||
      guide.sourceDescription ||
      "Route details from the Scenders ride library.",
  );
  const facts = [
    guide.lengthMiles !== null
      ? { label: "Distance", value: `${displayNumber(guide.lengthMiles)} mi` }
      : null,
    guide.elevationFeet !== null
      ? {
          label: "Climbing",
          value: `${Math.round(guide.elevationFeet).toLocaleString()} ft`,
        }
      : null,
    guide.difficulty ? { label: "Difficulty", value: guide.difficulty } : null,
    guide.rating !== null
      ? { label: "Rating", value: `★ ${guide.rating.toFixed(1)}` }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const hasTrack = guide.trackCoordinates.length >= 2;
  const imageUrl = guide.featuredImage || guide.thumbnailUrl;
  const editorial = guide.content;
  const hasStructuredEditorial = Boolean(
    editorial?.introduction ||
    editorial?.sections.length ||
    editorial?.sidebarBoxes.length ||
    editorial?.conclusion ||
    editorial?.faq.length ||
    editorial?.caveats.length,
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 48,
          paddingHorizontal: 18,
        }}
      >
        {imageUrl && !heroImageFailed ? (
          <View
            style={[
              styles.heroMedia,
              { backgroundColor: colors.routeBackground },
            ]}
          >
            <Image
              source={{ uri: imageUrl }}
              style={styles.heroImage}
              contentFit="cover"
              transition={200}
              onError={() => setHeroImageFailed(true)}
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.66)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroMediaLabel}>
              <Text style={styles.heroMediaLabelText}>
                {hasTrack ? "RIDE + GPS ROUTE" : "FULL RIDE GUIDE"}
              </Text>
            </View>
          </View>
        ) : hasTrack ? (
          <RideRoutePreview
            points={guide.trackCoordinates}
            height={280}
            label={guide.difficulty || undefined}
          />
        ) : (
          <View
            style={[
              styles.guideHeroFallback,
              { backgroundColor: colors.routeBackground },
            ]}
          >
            <Feather name="book-open" size={34} color={colors.primary} />
            <Text
              style={[
                styles.guideHeroFallbackText,
                { color: colors.routeForeground },
              ]}
            >
              Full ride guide
            </Text>
          </View>
        )}

        <Text style={[styles.location, { color: colors.primary }]}>
          {location}
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {guide.title}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {description}
        </Text>

        {facts.length ? (
          <View style={[styles.facts, { borderColor: colors.border }]}>
            {facts.map((fact) => (
              <View key={fact.label} style={styles.fact}>
                <Text
                  style={[styles.factLabel, { color: colors.mutedForeground }]}
                >
                  {fact.label}
                </Text>
                <Text style={[styles.factValue, { color: colors.foreground }]}>
                  {fact.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {hasTrack ? (
          <>
            <View style={styles.routeSection}>
              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>
                    GPS ROUTE
                  </Text>
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    Route preview
                  </Text>
                </View>
                <Feather name="map" size={20} color={colors.primary} />
              </View>
              <RideRoutePreview
                points={guide.trackCoordinates}
                height={220}
                label={guide.difficulty || undefined}
              />
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => openOnMap(true)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}
              >
                <Feather
                  name="navigation"
                  size={18}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.primaryButtonText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Follow this ride
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openOnMap(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <Feather
                  name={savedDataset ? "check" : "download"}
                  size={18}
                  color={colors.primary}
                />
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: colors.primary },
                  ]}
                >
                  {savedDataset ? "Saved on this device" : "Save route"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View
            style={[
              styles.guideOnlyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="book-open" size={21} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noteTitle, { color: colors.foreground }]}>
                Editorial guide
              </Text>
              <Text
                style={[styles.noteBody, { color: colors.mutedForeground }]}
              >
                This ride does not include a followable GPX. The complete ride
                guide is included below.
              </Text>
            </View>
          </View>
        )}

        {guide.directions ? (
          <View style={[styles.noteCard, { backgroundColor: colors.accent }]}>
            <Feather name="map-pin" size={20} color={colors.accentForeground} />
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.noteTitle, { color: colors.accentForeground }]}
              >
                Getting there
              </Text>
              <Text
                style={[styles.noteBody, { color: colors.accentForeground }]}
              >
                {editorialText(guide.directions)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.editorial, { borderColor: colors.border }]}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            {hasTrack ? "RIDE GUIDE" : "FULL RIDE GUIDE"}
          </Text>
          <Text style={[styles.editorialTitle, { color: colors.foreground }]}>
            {editorial?.magazineTitle || guide.title}
          </Text>

          {editorial?.introduction ? (
            <Text
              style={[styles.editorialLead, { color: colors.mutedForeground }]}
            >
              {editorialText(editorial.introduction)}
            </Text>
          ) : null}

          {editorial?.sections.map((section, index) => (
            <View
              key={`${section.heading}-${index}`}
              style={styles.editorialSection}
            >
              <Text
                style={[styles.editorialHeading, { color: colors.foreground }]}
              >
                {section.heading}
              </Text>
              <Text
                style={[
                  styles.editorialBody,
                  { color: colors.mutedForeground },
                ]}
              >
                {editorialText(section.content)}
              </Text>
            </View>
          ))}

          {!hasStructuredEditorial && guide.sourceDescription ? (
            <Text
              style={[styles.editorialBody, { color: colors.mutedForeground }]}
            >
              {editorialText(guide.sourceDescription)}
            </Text>
          ) : null}

          {editorial?.sidebarBoxes.map((box, index) => (
            <View
              key={`${box.title}-${index}`}
              style={[
                styles.editorialCallout,
                { backgroundColor: colors.accent },
              ]}
            >
              <View style={styles.calloutHeading}>
                <Feather
                  name={box.type === "warning" ? "alert-triangle" : "info"}
                  size={18}
                  color={colors.accentForeground}
                />
                <Text
                  style={[
                    styles.calloutTitle,
                    { color: colors.accentForeground },
                  ]}
                >
                  {box.title}
                </Text>
              </View>
              {box.content ? (
                <Text
                  style={[
                    styles.calloutBody,
                    { color: colors.accentForeground },
                  ]}
                >
                  {editorialText(box.content)}
                </Text>
              ) : null}
              {box.items.map((item, itemIndex) => (
                <View key={`${item}-${itemIndex}`} style={styles.bulletRow}>
                  <View
                    style={[
                      styles.bullet,
                      { backgroundColor: colors.accentForeground },
                    ]}
                  />
                  <Text
                    style={[
                      styles.bulletText,
                      { color: colors.accentForeground },
                    ]}
                  >
                    {editorialText(item)}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {editorial?.conclusion ? (
            <View style={styles.editorialSection}>
              <Text
                style={[styles.editorialHeading, { color: colors.foreground }]}
              >
                Before you roll
              </Text>
              <Text
                style={[
                  styles.editorialBody,
                  { color: colors.mutedForeground },
                ]}
              >
                {editorialText(editorial.conclusion)}
              </Text>
            </View>
          ) : null}

          {editorial?.caveats.length ? (
            <View
              style={[
                styles.caveatsCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.calloutTitle, { color: colors.foreground }]}>
                Check before you ride
              </Text>
              {editorial.caveats.map((caveat, index) => (
                <View key={`${caveat}-${index}`} style={styles.bulletRow}>
                  <View
                    style={[styles.bullet, { backgroundColor: colors.primary }]}
                  />
                  <Text
                    style={[
                      styles.bulletText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {editorialText(caveat)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {editorial?.faq.length ? (
            <View style={styles.faqBlock}>
              <Text
                style={[styles.editorialHeading, { color: colors.foreground }]}
              >
                Rider FAQ
              </Text>
              {editorial.faq.map((entry, index) => (
                <View
                  key={`${entry.question}-${index}`}
                  style={[styles.faqItem, { borderColor: colors.border }]}
                >
                  <Text
                    style={[styles.faqQuestion, { color: colors.foreground }]}
                  >
                    {entry.question}
                  </Text>
                  <Text
                    style={[
                      styles.editorialBody,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {editorialText(entry.answer)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {editorial?.relatedTopics.length ? (
            <View style={styles.relatedBlock}>
              <Text
                style={[styles.relatedLabel, { color: colors.mutedForeground }]}
              >
                RELATED
              </Text>
              <View style={styles.relatedTopics}>
                {editorial.relatedTopics.map((topic) => (
                  <View
                    key={topic}
                    style={[
                      styles.topicPill,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.topicText, { color: colors.foreground }]}
                    >
                      {topic}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.linkCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.linkTitle, { color: colors.foreground }]}>
            More from Scenders
          </Text>
          <Text style={[styles.linkBody, { color: colors.mutedForeground }]}>
            Open this guide on Scenders.com or browse gear for your next ride.
            Product availability and checkout stay on Scenders.com.
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(rideGuideWebUrl(guide))}
            style={styles.textLink}
          >
            <Text style={[styles.textLinkLabel, { color: colors.primary }]}>
              Open on Scenders.com
            </Text>
            <Feather name="external-link" size={15} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => void Linking.openURL(SCENDERS_SHOP_URL)}
            style={styles.textLink}
          >
            <Text style={[styles.textLinkLabel, { color: colors.primary }]}>
              Shop Scenders
            </Text>
            <Feather name="shopping-bag" size={15} color={colors.primary} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", flex: 1, gap: 10, justifyContent: "center" },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  iconButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  wordmark: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6 },
  heroMedia: {
    borderRadius: 22,
    height: 280,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: { ...StyleSheet.absoluteFill },
  heroMediaLabel: {
    backgroundColor: "rgba(0,0,0,0.66)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    bottom: 14,
    left: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: "absolute",
  },
  heroMediaLabelText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  guideHeroFallback: {
    alignItems: "center",
    borderRadius: 22,
    gap: 12,
    height: 280,
    justifyContent: "center",
  },
  guideHeroFallbackText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  location: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 24,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: 8,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    lineHeight: 25,
    marginTop: 14,
  },
  facts: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 24,
    paddingVertical: 16,
  },
  fact: { minWidth: "50%", paddingVertical: 7 },
  factLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  factValue: { fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 4 },
  routeSection: { gap: 12, marginTop: 28 },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.45,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    letterSpacing: -0.35,
    marginTop: 5,
  },
  actions: { gap: 10, marginTop: 22 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  secondaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  guideOnlyCard: {
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    padding: 18,
  },
  noteCard: {
    alignItems: "flex-start",
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
    padding: 18,
  },
  noteTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  noteBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  editorial: {
    borderTopWidth: 1,
    marginTop: 34,
    paddingTop: 28,
  },
  editorialTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 29,
    letterSpacing: -0.7,
    lineHeight: 35,
    marginTop: 8,
  },
  editorialLead: {
    fontFamily: "Inter_500Medium",
    fontSize: 17,
    lineHeight: 27,
    marginTop: 18,
  },
  editorialSection: { marginTop: 28 },
  editorialHeading: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    letterSpacing: -0.35,
    lineHeight: 27,
  },
  editorialBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 24,
    marginTop: 9,
  },
  editorialCallout: { borderRadius: 18, marginTop: 24, padding: 18 },
  calloutHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  calloutTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 21 },
  calloutBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
  },
  bulletRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  bullet: { borderRadius: 3, height: 5, marginTop: 8, width: 5 },
  bulletText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  caveatsCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 26,
    padding: 18,
  },
  faqBlock: { marginTop: 30 },
  faqItem: { borderTopWidth: 1, marginTop: 14, paddingTop: 16 },
  faqQuestion: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    lineHeight: 21,
  },
  relatedBlock: { marginTop: 28 },
  relatedLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.3,
  },
  relatedTopics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  topicPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  topicText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  linkCard: { borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 18 },
  linkTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  linkBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
    marginTop: 6,
  },
  textLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
  },
  textLinkLabel: { fontFamily: "Inter_700Bold", fontSize: 13 },
  stateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
