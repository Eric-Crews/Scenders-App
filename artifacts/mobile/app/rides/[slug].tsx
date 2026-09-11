import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
      pathname: "/",
      params: follow ? { followDataset: dataset.id } : { dataset: dataset.id },
    });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
          Loading ride…
        </Text>
      </View>
    );
  }

  if (error || !guide) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingHorizontal: 24 },
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
    );
  }

  const location =
    [guide.city, guide.state].filter(Boolean).join(", ") ||
    guide.location ||
    "Scenders ride guide";
  const description =
    guide.generatedDescription ||
    guide.sourceDescription ||
    "Route details from the Scenders ride library.";
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 48,
          paddingHorizontal: 18,
        }}
      >
        <View style={styles.topBar}>
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
          <View style={{ width: 44 }} />
        </View>

        <RideRoutePreview
          points={guide.trackCoordinates}
          height={280}
          label={guide.difficulty || undefined}
        />

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

        <View style={styles.actions}>
          <Pressable
            disabled={!hasTrack}
            onPress={() => openOnMap(true)}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: hasTrack ? colors.primary : colors.muted,
                opacity: pressed ? 0.84 : 1,
              },
            ]}
          >
            <Feather
              name="navigation"
              size={18}
              color={
                hasTrack ? colors.primaryForeground : colors.mutedForeground
              }
            />
            <Text
              style={[
                styles.primaryButtonText,
                {
                  color: hasTrack
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              {hasTrack ? "Follow this ride" : "Track unavailable"}
            </Text>
          </Pressable>
          {hasTrack ? (
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
                style={[styles.secondaryButtonText, { color: colors.primary }]}
              >
                {savedDataset ? "Saved on this device" : "Save route"}
              </Text>
            </Pressable>
          ) : null}
        </View>

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
                {guide.directions}
              </Text>
            </View>
          </View>
        ) : null}

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
            Read the full editorial guide or open the Scenders store. Product
            availability and checkout stay on Scenders.com.
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(rideGuideWebUrl(guide))}
            style={styles.textLink}
          >
            <Text style={[styles.textLinkLabel, { color: colors.primary }]}>
              Read the full ride guide
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
