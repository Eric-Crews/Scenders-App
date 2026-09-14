import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  filterRideGuides,
  listRideGuides,
  type RideGuide,
  type RideGuideFilters,
} from "@/lib/rideForest";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const RATING_FILTERS = [4.5, 4, 3] as const;
const DISTANCE_FILTERS = [10, 25, 50] as const;

function miles(value: number | null): string | null {
  if (value === null) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} mi`;
}

function RideCard({ item, onPress }: { item: RideGuide; onPress: () => void }) {
  const colors = useColors();
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = item.featuredImage || item.thumbnailUrl;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ride guide for ${item.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View
        style={[styles.cardMedia, { backgroundColor: colors.routeBackground }]}
      >
        {imageUrl && !imageFailed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={180}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.imageFallback}>
            <Feather name="book-open" size={28} color={colors.primary} />
            <Text
              style={[
                styles.imageFallbackText,
                { color: colors.routeForeground },
              ]}
            >
              Full ride guide
            </Text>
          </View>
        )}
        {imageUrl && !imageFailed ? (
          <LinearGradient
            colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.62)"]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.mediaBadge}>
          <Text style={styles.mediaBadgeText}>
            {item.difficulty || "RIDE GUIDE"}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.location, { color: colors.primary }]}>
          {[item.city, item.state].filter(Boolean).join(", ") ||
            item.location ||
            "Scenders ride guide"}
        </Text>
        <Text
          style={[styles.cardTitle, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={styles.stats}>
          {item.rating !== null ? (
            <Text style={[styles.stat, { color: colors.foreground }]}>
              ★ {item.rating.toFixed(1)}
            </Text>
          ) : null}
          {miles(item.lengthMiles) ? (
            <Text style={[styles.stat, { color: colors.mutedForeground }]}>
              {miles(item.lengthMiles)}
            </Text>
          ) : null}
          {item.elevationFeet !== null ? (
            <Text style={[styles.stat, { color: colors.mutedForeground }]}>
              {Math.round(item.elevationFeet).toLocaleString()} ft
            </Text>
          ) : null}
          <Feather
            name="arrow-up-right"
            size={18}
            color={colors.primary}
            style={{ marginLeft: "auto" }}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default function RidesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [guides, setGuides] = useState<RideGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RideGuideFilters>({
    difficulty: null,
    minimumRating: null,
    maximumDistanceMiles: null,
  });

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setGuides(await listRideGuides(force));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The ride library is unavailable.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const difficulties = useMemo(
    () =>
      Array.from(
        new Set(
          guides
            .map((guide) => guide.difficulty?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [guides],
  );
  const filtered = useMemo(
    () => filterRideGuides(guides, filters),
    [filters, guides],
  );
  const activeFilterCount = [
    filters.difficulty,
    filters.minimumRating,
    filters.maximumDistanceMiles,
  ].filter((value) => value !== null).length;

  const Chip = ({
    active,
    label,
    onPress,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? colors.primaryForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const FilterRow = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <View style={styles.filterRow}>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {children}
      </ScrollView>
    </View>
  );

  const header = (
    <View>
      <View style={[styles.hero, { backgroundColor: colors.routeBackground }]}>
        <View style={[styles.brandRule, { backgroundColor: colors.primary }]} />
        <Text style={[styles.kicker, { color: colors.primary }]}>
          SCENDERS RIDES
        </Text>
        <Text style={[styles.heroTitle, { color: colors.routeForeground }]}>
          Find the line worth riding.
        </Text>
        <Text style={[styles.heroBody, { color: colors.routeCasing }]}>
          Curated mountain-bike and gravel rides with route tracks ready for the
          map.
        </Text>
      </View>

      <View
        style={[
          styles.filters,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        <View style={styles.filterHeader}>
          <View>
            <Text style={[styles.filterTitle, { color: colors.foreground }]}>
              Narrow the ride
            </Text>
            <Text
              style={[styles.filterHint, { color: colors.mutedForeground }]}
            >
              Only facts supplied by the ride guide.
            </Text>
          </View>
          {activeFilterCount ? (
            <Pressable
              onPress={() =>
                setFilters({
                  difficulty: null,
                  minimumRating: null,
                  maximumDistanceMiles: null,
                })
              }
              hitSlop={8}
            >
              <Text style={[styles.clearText, { color: colors.primary }]}>
                Clear {activeFilterCount}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {difficulties.length ? (
          <FilterRow label="Difficulty">
            <Chip
              active={filters.difficulty === null}
              label="Any"
              onPress={() =>
                setFilters((current) => ({ ...current, difficulty: null }))
              }
            />
            {difficulties.map((difficulty) => (
              <Chip
                key={difficulty}
                active={filters.difficulty === difficulty}
                label={difficulty}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    difficulty:
                      current.difficulty === difficulty ? null : difficulty,
                  }))
                }
              />
            ))}
          </FilterRow>
        ) : null}
        <FilterRow label="Rating">
          <Chip
            active={filters.minimumRating === null}
            label="Any"
            onPress={() =>
              setFilters((current) => ({ ...current, minimumRating: null }))
            }
          />
          {RATING_FILTERS.map((rating) => (
            <Chip
              key={rating}
              active={filters.minimumRating === rating}
              label={`${rating}+`}
              onPress={() =>
                setFilters((current) => ({
                  ...current,
                  minimumRating:
                    current.minimumRating === rating ? null : rating,
                }))
              }
            />
          ))}
        </FilterRow>
        <FilterRow label="Distance">
          <Chip
            active={filters.maximumDistanceMiles === null}
            label="Any"
            onPress={() =>
              setFilters((current) => ({
                ...current,
                maximumDistanceMiles: null,
              }))
            }
          />
          {DISTANCE_FILTERS.map((distance) => (
            <Chip
              key={distance}
              active={filters.maximumDistanceMiles === distance}
              label={`Up to ${distance} mi`}
              onPress={() =>
                setFilters((current) => ({
                  ...current,
                  maximumDistanceMiles:
                    current.maximumDistanceMiles === distance ? null : distance,
                }))
              }
            />
          ))}
        </FilterRow>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={[styles.resultsTitle, { color: colors.foreground }]}>
          Ride library
        </Text>
        <Text style={[styles.resultsCount, { color: colors.mutedForeground }]}>
          {filtered.length} {filtered.length === 1 ? "ride" : "rides"}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(guide) => guide.id}
        contentContainerStyle={{
          paddingTop: insets.top + WEB_TOP_INSET,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 104,
          paddingHorizontal: 18,
        }}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <RideCard
            item={item}
            onPress={() =>
              router.push(`/rides/${encodeURIComponent(item.slug)}`)
            }
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.primary} />
              <Text
                style={[styles.stateText, { color: colors.mutedForeground }]}
              >
                Loading Scenders rides…
              </Text>
            </View>
          ) : error ? (
            <View
              style={[
                styles.stateCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="wifi-off" size={24} color={colors.primary} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                Couldn’t load the ride library
              </Text>
              <Text
                style={[styles.stateText, { color: colors.mutedForeground }]}
              >
                {error}
              </Text>
              <Pressable
                onPress={() => void load(true)}
                style={[styles.retry, { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[
                    styles.retryText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={[
                styles.stateCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather name="sliders" size={24} color={colors.primary} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                No rides match
              </Text>
              <Text
                style={[styles.stateText, { color: colors.mutedForeground }]}
              >
                Clear a filter to widen the list.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { borderRadius: 24, marginBottom: 16, marginTop: 14, padding: 24 },
  brandRule: { borderRadius: 99, height: 4, marginBottom: 20, width: 42 },
  kicker: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2 },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 34,
    letterSpacing: -1.1,
    lineHeight: 38,
    marginTop: 10,
    maxWidth: 300,
  },
  heroBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 320,
    opacity: 0.78,
  },
  filters: {
    borderBottomWidth: 1,
    borderTopWidth: 1,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  filterHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  filterTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  filterHint: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  clearText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  filterRow: { marginBottom: 13 },
  filterLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  chips: { gap: 8, paddingRight: 18 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  resultsHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 24,
  },
  resultsTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  resultsCount: { fontFamily: "Inter_500Medium", fontSize: 12 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
    padding: 8,
  },
  cardMedia: {
    borderRadius: 15,
    height: 190,
    overflow: "hidden",
    position: "relative",
  },
  cardImage: { ...StyleSheet.absoluteFillObject },
  imageFallback: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
  },
  imageFallbackText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  mediaBadge: {
    backgroundColor: "rgba(0,0,0,0.66)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    top: 12,
  },
  mediaBadgeText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardBody: { paddingHorizontal: 10, paddingBottom: 10, paddingTop: 14 },
  location: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    lineHeight: 27,
    marginTop: 6,
  },
  stats: { alignItems: "center", flexDirection: "row", gap: 14, marginTop: 14 },
  stat: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  state: { alignItems: "center", gap: 10, paddingVertical: 48 },
  stateCard: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 28,
  },
  stateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 4,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  retry: {
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { fontFamily: "Inter_700Bold", fontSize: 13 },
});
