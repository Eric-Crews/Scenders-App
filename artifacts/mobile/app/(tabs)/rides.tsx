import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScendersHeader } from "@/components/ScendersChrome";
import { scendersDesign as design } from "@/constants/scendersDesign";
import { geocodeDestination } from "@/lib/geocoding";
import {
  listRideGuides,
  rideGuideImageUrls,
  type RideGuide,
} from "@/lib/rideForest";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const RATING_FILTERS = [4.5, 4, 3] as const;
const DISTANCE_FILTERS = [10, 25, 50] as const;

function miles(value: number | null): string | null {
  if (value === null) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} mi`;
}

type ActiveLocation = {
  lat: number;
  lng: number;
  label: string;
};

function RideCard({
  item,
  distance,
  onPress,
}: {
  item: RideGuide;
  distance: number | null;
  onPress: () => void;
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = rideGuideImageUrls(item)[imageIndex];
  useEffect(() => setImageIndex(0), [item.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ride guide for ${item.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardMedia}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={180}
            onError={() => setImageIndex((index) => index + 1)}
          />
        ) : (
          <View style={styles.imageFallback}>
            <Feather
              name="book-open"
              size={28}
              color={design.color.lineStrong}
            />
          </View>
        )}
        {imageUrl ? (
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
        <View style={styles.cardHeaderRow}>
          <Text style={styles.location} numberOfLines={1}>
            {[item.city, item.state].filter(Boolean).join(", ") ||
              item.location ||
              "Scenders ride guide"}
          </Text>
          {distance !== null ? (
            <View style={styles.distanceBadge}>
              <Feather
                name="navigation"
                size={10}
                color={design.color.orangeBright}
              />
              <Text style={styles.distanceText}>
                {distance < 10 ? distance.toFixed(1) : Math.round(distance)} mi
                away
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.stats}>
          {item.rating !== null ? (
            <Text style={styles.stat}>★ {item.rating.toFixed(1)}</Text>
          ) : null}
          {miles(item.lengthMiles) ? (
            <Text style={styles.stat}>{miles(item.lengthMiles)}</Text>
          ) : null}
          {item.elevationFeet !== null ? (
            <Text style={styles.stat}>
              {Math.round(item.elevationFeet).toLocaleString()} ft
            </Text>
          ) : null}
          <Feather
            name="arrow-up-right"
            size={18}
            color={design.color.textFaint}
            style={{ marginLeft: "auto" }}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default function RidesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [guides, setGuides] = useState<RideGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [facetDifficulties, setFacetDifficulties] = useState<string[]>([]);
  const requestSeq = useRef(0);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);

  const { q } = useLocalSearchParams<{ q?: string }>();
  const [searchQuery, setSearchQuery] = useState(q || "");

  useEffect(() => {
    if (q !== undefined) {
      setSearchQuery(q);
    }
  }, [q]);

  // Location State
  const [activeLocation, setActiveLocation] = useState<ActiveLocation | null>(
    null
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "searching" | "granted" | "denied" | "error"
  >("idle");
  const [locationError, setLocationError] = useState<string | null>(null);

  // Filters and Sort State
  const [sortBy, setSortBy] = useState<"nearest" | "top-rated">("top-rated");
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [minimumRating, setMinimumRating] = useState<number | null>(null);
  const [routeLength, setRouteLength] = useState<
    "short" | "medium" | "long" | null
  >(null);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery.trim());

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(searchQuery.trim()),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const advancedActiveCount =
    (difficulty ? 1 : 0) + (minimumRating ? 1 : 0) + (routeLength ? 1 : 0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (advancedActiveCount > 0) {
      setShowAdvanced(true);
    }
  }, [advancedActiveCount]);

  const searchPlace = async (query: string) => {
    if (!query.trim()) return;
    setLocationStatus("searching");
    setLocationError(null);
    try {
      const result = await geocodeDestination(query);
      setActiveLocation({
        lat: result.lat,
        lng: result.lng,
        label: result.label || query,
      });
      setLocationStatus("granted");
    } catch (err) {
      setLocationError(
        err instanceof Error ? err.message : "Location search failed.",
      );
      setLocationStatus("error");
    }
  };

  const locateGPS = async () => {
    setLocationStatus("locating");
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location access denied.");
        setLocationStatus("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setActiveLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Current GPS",
      });
      setLocationStatus("granted");
    } catch (err) {
      setLocationError("Failed to get location.");
      setLocationStatus("error");
    }
  };

  const clearLocation = () => {
    setActiveLocation(null);
    setPlaceQuery("");
    setLocationError(null);
    if (sortBy === "nearest") setSortBy("top-rated");
    setRadiusMiles(null);
  };

  const handleSetSort = (s: "nearest" | "top-rated") => {
    if (s === "nearest" && !activeLocation) {
      setSortBy(s);
      void locateGPS();
    } else {
      setSortBy(s);
    }
  };

  const handleSetRadius = (r: number | null) => {
    if (r !== null && !activeLocation) {
      setRadiusMiles(r);
      void locateGPS();
    } else {
      setRadiusMiles(r);
    }
  };

  const catalogParams = useMemo(
    () => ({
      pageSize: 24,
      q: debouncedSearch || undefined,
      difficulty: difficulty || undefined,
      minRating: minimumRating || undefined,
      length: routeLength || undefined,
      lat: activeLocation?.lat,
      lng: activeLocation?.lng,
      radiusMiles: activeLocation ? radiusMiles ?? undefined : undefined,
      sort:
        sortBy === "nearest" && activeLocation
          ? ("nearest" as const)
          : ("rating" as const),
    }),
    [
      debouncedSearch,
      difficulty,
      minimumRating,
      routeLength,
      activeLocation,
      radiusMiles,
      sortBy,
    ],
  );
  const catalogKey = JSON.stringify(catalogParams);

  const loadPage = useCallback(
    async (page: number, reset: boolean, isRefresh = false) => {
      if (!reset && (loadingRef.current || !hasMoreRef.current)) return;
      const seq = reset ? ++requestSeq.current : requestSeq.current;
      loadingRef.current = true;
      setError(null);
      if (reset) {
        setGuides([]);
        setTotal(0);
        setHasMore(false);
        hasMoreRef.current = false;
        pageRef.current = 1;
        setLoading(true);
        if (isRefresh) setRefreshing(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const response = await listRideGuides({ ...catalogParams, page });
        if (seq !== requestSeq.current) return;
        const seen = new Set<string>();
        setGuides((previous) => {
          const next = reset ? response.items : [...previous, ...response.items];
          return next.filter((guide) => {
            if (seen.has(guide.id)) return false;
            seen.add(guide.id);
            return true;
          });
        });
        pageRef.current = response.page;
        hasMoreRef.current = response.hasMore;
        setHasMore(response.hasMore);
        setTotal(response.total);
        setFacetDifficulties(response.facets.difficulties);
      } catch (loadError) {
        if (seq !== requestSeq.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The ride library is unavailable.",
        );
      } finally {
        if (seq === requestSeq.current) {
          loadingRef.current = false;
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [catalogParams],
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [catalogKey, loadPage]);

  const loadNextPage = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    void loadPage(pageRef.current + 1, false);
  }, [loadPage]);

  const retry = useCallback(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const difficulties = useMemo(
    () =>
      [...facetDifficulties].sort((a, b) => a.localeCompare(b)),
    [facetDifficulties],
  );

  const processedGuides = useMemo(() => {
    return guides.map((guide) => ({ guide, distance: guide.distanceMiles }));
  }, [guides]);

  const Chip = ({
    active,
    label,
    onPress,
    disabled = false,
  }: {
    active: boolean;
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          active && styles.chipTextActive,
          disabled && styles.chipTextDisabled,
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
      <Text style={styles.filterLabel}>{label}</Text>
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
    <View style={styles.header}>
      <ScendersHeader />
      <View style={styles.heroTextContainer}>
        <View style={styles.brandRule} />
        <Text style={styles.kicker}>RIDE LIBRARY</Text>
        <Text style={styles.heroTitle}>Find the line worth riding.</Text>
        <Text style={styles.heroBody}>
          Curated mountain-bike and gravel rides with route tracks ready for the
          map.
        </Text>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.inputContainer}>
          {activeLocation ? (
            <View style={styles.activeLocationBadge}>
              <Feather
                name="map-pin"
                size={16}
                color={design.color.orangeBright}
              />
              <Text style={styles.activeLocationText} numberOfLines={1}>
                {activeLocation.label}
              </Text>
              <Pressable
                onPress={clearLocation}
                style={styles.clearLocation}
                hitSlop={8}
              >
                <Feather
                  name="x-circle"
                  size={16}
                  color={design.color.textMuted}
                />
              </Pressable>
            </View>
          ) : (
            <>
              <Feather
                name="map-pin"
                size={16}
                color={design.color.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Destination (e.g. Moab, UT)"
                placeholderTextColor={design.color.textMuted}
                value={placeQuery}
                onChangeText={setPlaceQuery}
                onSubmitEditing={() => searchPlace(placeQuery)}
                returnKeyType="search"
              />
              {locationStatus === "searching" ||
              locationStatus === "locating" ? (
                <ActivityIndicator
                  size="small"
                  color={design.color.orangeBright}
                  style={styles.gpsButton}
                />
              ) : (
                <Pressable
                  onPress={() =>
                    placeQuery.trim()
                      ? void searchPlace(placeQuery)
                      : void locateGPS()
                  }
                  style={styles.gpsButton}
                  accessibilityLabel={
                    placeQuery.trim()
                      ? "Search destination"
                      : "Use current GPS"
                  }
                  hitSlop={8}
                >
                  <Feather
                    name={placeQuery.trim() ? "search" : "navigation"}
                    size={16}
                    color={design.color.textMuted}
                  />
                </Pressable>
              )}
            </>
          )}
        </View>
        {locationError ? (
          <Text style={styles.errorText}>{locationError}</Text>
        ) : null}

        <View style={styles.inputContainer}>
          <Feather
            name="search"
            size={16}
            color={design.color.textMuted}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Search rides, places, tags..."
            placeholderTextColor={design.color.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              style={styles.gpsButton}
              hitSlop={8}
            >
              <Feather
                name="x-circle"
                size={16}
                color={design.color.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filtersSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Discovery</Text>
        </View>
        <FilterRow label="SORT BY">
          <Chip
            active={sortBy === "nearest"}
            label="Nearest"
            onPress={() => handleSetSort("nearest")}
          />
          <Chip
            active={sortBy === "top-rated"}
            label="Top Rated"
            onPress={() => handleSetSort("top-rated")}
          />
        </FilterRow>

        <FilterRow label="RADIUS">
          <Chip
            active={radiusMiles === null}
            label="Any"
            onPress={() => handleSetRadius(null)}
          />
          <Chip
            active={radiusMiles === 10}
            label="10 mi"
            onPress={() => handleSetRadius(10)}
          />
          <Chip
            active={radiusMiles === 25}
            label="25 mi"
            onPress={() => handleSetRadius(25)}
          />
          <Chip
            active={radiusMiles === 50}
            label="50 mi"
            onPress={() => handleSetRadius(50)}
          />
        </FilterRow>
      </View>

      <View style={styles.advancedSection}>
        <Pressable
          onPress={() => setShowAdvanced(!showAdvanced)}
          style={styles.advancedHeader}
          hitSlop={8}
        >
          <Text style={styles.advancedTitle}>
            Advanced Filters{" "}
            {advancedActiveCount > 0 ? `(${advancedActiveCount})` : ""}
          </Text>
          <Feather
            name={showAdvanced ? "chevron-up" : "chevron-down"}
            size={18}
            color={design.color.textMuted}
          />
        </Pressable>

        {showAdvanced && (
          <View style={styles.advancedBody}>
            {difficulties.length > 0 && (
              <FilterRow label="DIFFICULTY">
                <Chip
                  active={difficulty === null}
                  label="Any"
                  onPress={() => setDifficulty(null)}
                />
                {difficulties.map((diff) => (
                  <Chip
                    key={diff}
                    active={difficulty === diff}
                    label={diff}
                    onPress={() => setDifficulty(diff)}
                  />
                ))}
              </FilterRow>
            )}
            <FilterRow label="RATING">
              <Chip
                active={minimumRating === null}
                label="Any"
                onPress={() => setMinimumRating(null)}
              />
              {RATING_FILTERS.map((r) => (
                <Chip
                  key={r}
                  active={minimumRating === r}
                  label={`${r}+`}
                  onPress={() => setMinimumRating(r)}
                />
              ))}
            </FilterRow>
            <FilterRow label="ROUTE LENGTH">
              <Chip
                active={routeLength === null}
                label="Any"
                onPress={() => setRouteLength(null)}
              />
              <Chip
                active={routeLength === "short"}
                label="< 10 mi"
                onPress={() => setRouteLength("short")}
              />
              <Chip
                active={routeLength === "medium"}
                label="10-25 mi"
                onPress={() => setRouteLength("medium")}
              />
              <Chip
                active={routeLength === "long"}
                label="25+ mi"
                onPress={() => setRouteLength("long")}
              />
            </FilterRow>
            {advancedActiveCount > 0 && (
              <Pressable
                onPress={() => {
                  setDifficulty(null);
                  setMinimumRating(null);
                  setRouteLength(null);
                }}
                style={styles.clearAdvancedBtn}
              >
                <Text style={styles.clearAdvancedText}>Clear Advanced</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Ride library</Text>
        <Text style={styles.resultsCount}>
          {total} {total === 1 ? "ride" : "rides"}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={processedGuides}
        keyExtractor={(item) => item.guide.id}
        contentContainerStyle={{
          paddingTop: insets.top + WEB_TOP_INSET,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 104,
          paddingHorizontal: 18,
        }}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPage(1, true, true)}
            tintColor={design.color.orangeBright}
          />
        }
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <RideCard
            item={item.guide}
            distance={item.distance}
            onPress={() =>
              router.push(`/rides/${encodeURIComponent(item.guide.slug)}`)
            }
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={design.color.orangeBright} />
              <Text style={styles.stateText}>Loading Scenders rides…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Feather
                name="wifi-off"
                size={24}
                color={design.color.orangeBright}
              />
              <Text style={styles.stateTitle}>
                Couldn’t load the ride library
              </Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable
                onPress={retry}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <Feather
                name="sliders"
                size={24}
                color={design.color.orangeBright}
              />
              <Text style={styles.stateTitle}>No rides match</Text>
              <Text style={styles.stateText}>
                {searchQuery.trim() || advancedActiveCount > 0 || radiusMiles
                  ? "Try adjusting your search or filters."
                  : "Clear a filter to widen the list."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreState}>
              <ActivityIndicator color={design.color.orangeBright} />
              <Text style={styles.stateText}>Loading more rides…</Text>
            </View>
          ) : error && guides.length > 0 ? (
            <View style={styles.loadMoreState}>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={retry} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : hasMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more ride guides"
              onPress={loadNextPage}
              style={styles.loadMoreBtn}
            >
              <Text style={styles.loadMoreText}>Load more rides</Text>
            </Pressable>
          ) : guides.length > 0 ? (
            <Text style={styles.endText}>You’ve reached the end.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: design.color.canvas,
  },
  header: {
    paddingBottom: 8,
  },
  heroTextContainer: {
    backgroundColor: design.color.surface,
    borderRadius: design.radius.medium,
    padding: 24,
    marginBottom: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: design.color.line,
  },
  brandRule: {
    borderRadius: 99,
    height: 3,
    marginBottom: 16,
    width: 32,
    backgroundColor: design.color.orangeBright,
  },
  kicker: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    color: design.color.orangeBright,
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.8,
    lineHeight: 34,
    color: design.color.text,
    marginBottom: 8,
  },
  heroBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: design.color.textMuted,
  },
  searchSection: {
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: design.color.surfaceRaised,
    borderRadius: design.radius.medium,
    borderWidth: 1,
    borderColor: design.color.line,
    height: 48,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: design.color.text,
    height: "100%",
  },
  gpsButton: {
    padding: 8,
    marginRight: -8,
  },
  activeLocationBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  activeLocationText: {
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: design.color.text,
    marginLeft: 8,
  },
  clearLocation: {
    padding: 8,
    marginRight: -8,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: design.color.danger,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: design.color.text,
  },
  filtersSection: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: design.color.line,
    marginTop: 6,
  },
  filterRow: {
    marginBottom: 16,
  },
  filterLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
    color: design.color.textMuted,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  chips: {
    gap: 8,
    paddingRight: 18,
  },
  chip: {
    borderRadius: design.radius.pill,
    borderWidth: 1,
    borderColor: design.color.line,
    backgroundColor: design.color.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: design.color.orangeBright,
    borderColor: design.color.orangeBright,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: design.color.text,
  },
  chipTextActive: {
    color: design.color.black,
  },
  chipTextDisabled: {
    color: design.color.textFaint,
  },
  advancedSection: {
    borderTopWidth: 1,
    borderColor: design.color.line,
    paddingVertical: 16,
  },
  advancedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  advancedTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: design.color.text,
  },
  advancedBody: {
    marginTop: 20,
  },
  clearAdvancedBtn: {
    alignSelf: "flex-start",
    marginTop: -4,
    paddingVertical: 8,
  },
  clearAdvancedText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: design.color.orangeBright,
  },
  resultsHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingTop: 16,
  },
  resultsTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: design.color.text,
  },
  resultsCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: design.color.textMuted,
  },
  card: {
    borderRadius: design.radius.large,
    borderWidth: 1,
    borderColor: design.color.line,
    backgroundColor: design.color.surface,
    marginBottom: 16,
    overflow: "hidden",
    padding: 8,
  },
  cardPressed: {
    opacity: 0.88,
    backgroundColor: design.color.surfacePressed,
  },
  cardMedia: {
    borderRadius: design.radius.medium,
    height: 190,
    overflow: "hidden",
    position: "relative",
    backgroundColor: design.color.line,
  },
  cardImage: { ...StyleSheet.absoluteFill },
  imageFallback: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  mediaBadge: {
    backgroundColor: "rgba(0,0,0,0.66)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: design.radius.pill,
    borderWidth: 1,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    top: 12,
  },
  mediaBadgeText: {
    color: design.color.white,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardBody: { paddingHorizontal: 10, paddingBottom: 10, paddingTop: 14 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  location: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: design.color.orangeBright,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distanceText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: design.color.textMuted,
  },
  cardTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    lineHeight: 27,
    marginTop: 6,
    color: design.color.text,
  },
  stats: { alignItems: "center", flexDirection: "row", gap: 14, marginTop: 14 },
  stat: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: design.color.textMuted,
  },
  state: { alignItems: "center", gap: 10, paddingVertical: 48 },
  loadMoreState: { alignItems: "center", gap: 8, paddingVertical: 18 },
  loadMoreBtn: {
    alignSelf: "center",
    borderColor: design.color.line,
    borderRadius: design.radius.pill,
    borderWidth: 1,
    marginVertical: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  loadMoreText: {
    color: design.color.orangeBright,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  endText: {
    color: design.color.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingVertical: 18,
    textAlign: "center",
  },
  stateCard: {
    alignItems: "center",
    borderRadius: design.radius.large,
    borderWidth: 1,
    borderColor: design.color.line,
    backgroundColor: design.color.surface,
    gap: 8,
    padding: 28,
    marginTop: 16,
  },
  stateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 4,
    textAlign: "center",
    color: design.color.text,
  },
  stateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: design.color.textMuted,
  },
  retryBtn: {
    borderRadius: design.radius.pill,
    backgroundColor: design.color.orangeBright,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: design.color.black,
  },
});
