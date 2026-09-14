import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ScendersHeader,
  ScendersSectionHeading,
  ScendersWordmark,
} from "@/components/ScendersChrome";
import { scendersDesign as design } from "@/constants/scendersDesign";
import { useMaps } from "@/contexts/MapsContext";
import { useRecording } from "@/contexts/RecordingContext";
import { listHomeRideGuides, type RideGuide } from "@/lib/rideForest";
import { formatDuration } from "@/lib/trackRecording";
import type { Track } from "@/lib/types";
import { formatDistance } from "@/lib/units";

const WEB_TOP_INSET = Platform.OS === "web" ? 28 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const HOME_PRIMER_KEY = "scenders.home-primer.v1";
const FEATURED_RIDE_RADIUS_MILES = 20;

type Coordinates = { latitude: number; longitude: number };
type LocationState = "locating" | "available" | "denied" | "unavailable";

function distanceMiles(a: Coordinates, b: Coordinates): number {
  const earthRadiusMiles = 3958.8;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function guideDistance(guide: RideGuide, origin: Coordinates): number | null {
  const point =
    guide.lat !== null && guide.lng !== null
      ? { lat: guide.lat, lng: guide.lng }
      : guide.trackCoordinates[0];
  if (!point) return null;
  return distanceMiles(origin, {
    latitude: point.lat,
    longitude: point.lng,
  });
}

function rideLocation(guide: RideGuide): string {
  return (
    [guide.city, guide.state].filter(Boolean).join(", ") ||
    guide.location ||
    "Scenders ride guide"
  );
}

function rideMeta(guide: RideGuide): string[] {
  return [
    guide.difficulty,
    guide.lengthMiles === null ? null : `${guide.lengthMiles.toFixed(1)} mi`,
    guide.rating === null ? null : `★ ${guide.rating.toFixed(1)}`,
  ].filter((value): value is string => Boolean(value));
}

function trackDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type ActionCardProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  detail: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ActionCard({
  icon,
  title,
  detail,
  primary = false,
  disabled = false,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        primary ? styles.actionCardPrimary : styles.actionCardSecondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.actionCardPressed,
      ]}
    >
      <View style={styles.actionTopRow}>
        <View
          style={[
            styles.actionIcon,
            primary ? styles.actionIconPrimary : styles.actionIconSecondary,
          ]}
        >
          <Feather
            name={icon}
            size={19}
            color={primary ? design.color.black : design.color.orangeBright}
          />
        </View>
        <Feather
          name="arrow-up-right"
          size={17}
          color={primary ? design.color.black : design.color.textMuted}
        />
      </View>
      <View style={styles.actionCopy}>
        <Text
          style={[styles.actionTitle, primary && styles.actionTitlePrimary]}
        >
          {title}
        </Text>
        <Text
          style={[styles.actionDetail, primary && styles.actionDetailPrimary]}
        >
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function PrimerRow({
  icon,
  title,
  detail,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.primerRow}>
      <View style={styles.primerIcon}>
        <Feather name={icon} size={16} color={design.color.orangeBright} />
      </View>
      <View style={styles.primerCopy}>
        <Text style={styles.primerRowTitle}>{title}</Text>
        <Text style={styles.primerRowDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function TrackRow({
  track,
  units,
  onPress,
}: {
  track: Track;
  units: "imperial" | "metric";
  onPress: () => void;
}) {
  const plotted = track.kind === "plotted";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.routeRow, pressed && styles.rowPressed]}
    >
      <View style={styles.routeGlyph}>
        <Feather
          name={plotted ? "share-2" : "activity"}
          size={18}
          color={design.color.orangeBright}
        />
      </View>
      <View style={styles.routeCopy}>
        <Text style={styles.routeTitle} numberOfLines={1}>
          {track.name}
        </Text>
        <Text style={styles.routeMeta} numberOfLines={1}>
          {plotted ? "Planned route" : trackDate(track.startedAt)} ·{" "}
          {formatDistance(track.distanceMeters, units)}
          {!plotted && track.durationMs > 0
            ? ` · ${formatDuration(track.durationMs)}`
            : ""}
        </Text>
      </View>
      <Feather name="chevron-right" size={19} color={design.color.textFaint} />
    </Pressable>
  );
}

function GuideRow({ guide }: { guide: RideGuide }) {
  const imageUrl = guide.thumbnailUrl || guide.featuredImage;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/rides/${encodeURIComponent(guide.slug)}`)}
      style={({ pressed }) => [styles.routeRow, pressed && styles.rowPressed]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.guideThumb}
          contentFit="cover"
          transition={160}
        />
      ) : (
        <View style={styles.routeGlyph}>
          <Feather name="map" size={18} color={design.color.orangeBright} />
        </View>
      )}
      <View style={styles.routeCopy}>
        <Text style={styles.routeTitle} numberOfLines={1}>
          {guide.title}
        </Text>
        <Text style={styles.routeMeta} numberOfLines={1}>
          {rideLocation(guide)}
          {guide.lengthMiles === null
            ? ""
            : ` · ${guide.lengthMiles.toFixed(1)} mi`}
        </Text>
      </View>
      <Feather name="chevron-right" size={19} color={design.color.textFaint} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { tracks, regions, waypoints, datasets, settings } = useMaps();
  const recording = useRecording();
  const [guides, setGuides] = useState<RideGuide[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(true);
  const [lastLocation, setLastLocation] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [showPrimer, setShowPrimer] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(HOME_PRIMER_KEY)
      .then((seen) => {
        if (mounted) setShowPrimer(seen !== "seen");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const locate = async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted" && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!mounted) return;
        if (permission.status !== "granted") {
          setLocationState("denied");
          return;
        }

        const cached = await Location.getLastKnownPositionAsync();
        if (mounted && cached) {
          setLastLocation({
            latitude: cached.coords.latitude,
            longitude: cached.coords.longitude,
          });
          setLocationState("available");
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!mounted) return;
        setLastLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        setLocationState("available");
      } catch {
        if (!mounted) return;
        setLocationState((state) =>
          state === "available" ? state : "unavailable",
        );
      }
    };

    void locate();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (locationState === "locating") return;
    let mounted = true;
    setGuidesLoading(true);
    listHomeRideGuides(lastLocation)
      .then((next) => {
        if (mounted) setGuides(next);
      })
      .catch(() => {
        if (mounted) setGuides([]);
      })
      .finally(() => {
        if (mounted) setGuidesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [lastLocation, locationState]);

  const rankedGuides = useMemo(() => {
    return guides
      .map((guide) => ({
        guide,
        distance: lastLocation ? guideDistance(guide, lastLocation) : null,
      }))
      .filter(
        (item) =>
          !lastLocation ||
          (item.distance !== null &&
            item.distance <= FEATURED_RIDE_RADIUS_MILES),
      )
      .sort((a, b) => {
        if (a.guide.rating === null && b.guide.rating !== null) return 1;
        if (a.guide.rating !== null && b.guide.rating === null) return -1;
        if (a.guide.rating !== null && b.guide.rating !== null) {
          const ratingDifference = b.guide.rating - a.guide.rating;
          if (ratingDifference !== 0) return ratingDifference;
        }
        if (a.distance === null && b.distance === null) {
          return a.guide.title.localeCompare(b.guide.title);
        }
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
  }, [guides, lastLocation]);

  const waitingForLocation = locationState === "locating" && !lastLocation;
  const featuredGuide = waitingForLocation
    ? null
    : (rankedGuides[0]?.guide ?? null);
  const nearbyGuides = waitingForLocation
    ? []
    : rankedGuides.slice(1, 4).map((item) => item.guide);
  const featuredDistance = waitingForLocation
    ? null
    : (rankedGuides[0]?.distance ?? null);
  const recentTracks = useMemo(
    () => [...tracks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
    [tracks],
  );
  const offlineTiles = regions.reduce(
    (total, region) => total + region.tileCount,
    0,
  );
  const heroImage =
    featuredGuide?.featuredImage || featuredGuide?.thumbnailUrl || null;

  const dismissPrimer = () => {
    setShowPrimer(false);
    AsyncStorage.setItem(HOME_PRIMER_KEY, "seen").catch(() => {});
  };

  const startOrResumeRide = () => {
    if (recording.isRecording) {
      router.push("/map");
      return;
    }
    router.push({ pathname: "/map", params: { start: "1" } });
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + WEB_TOP_INSET + 10,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 112,
        }}
      >
        <View style={styles.content}>
          <ScendersHeader />

          <View style={styles.taglineRow}>
            <Text style={styles.tagline}>ASCEND. DESCEND. REPEAT.</Text>
          </View>

          <View style={styles.locationHeaderRow}>
            <Feather name="map-pin" size={12} color={design.color.textMuted} />
            <Text style={styles.locationHeaderText}>
              {locationState === "available" && lastLocation
                ? (featuredGuide ? rideLocation(featuredGuide).toUpperCase() : "YOUR LOCATION")
                : "FINDING RIDES NEAR YOU"}
            </Text>
            {locationState === "available" && <Feather name="chevron-down" size={14} color={design.color.textMuted} />}
          </View>

          <View style={styles.homeSearchContainer}>
            <Feather name="search" size={18} color={design.color.textMuted} style={styles.homeSearchIcon} />
            <TextInput
              style={styles.homeSearchInput}
              placeholder="Search trails, routes, or places"
              placeholderTextColor={design.color.textMuted}
              returnKeyType="search"
              onSubmitEditing={(e) => {
                if (e.nativeEvent.text.trim()) {
                  router.push({ pathname: "/rides", params: { q: e.nativeEvent.text.trim() } });
                }
              }}
            />
          </View>

          {featuredGuide ? (
            <View style={styles.featuredGuideLabel}>
              <Text style={styles.featuredGuideLabelText} numberOfLines={1}>
                {featuredGuide.title}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              featuredGuide ? `Open ${featuredGuide.title}` : "Explore rides"
            }
            onPress={() =>
              featuredGuide
                ? router.push(
                    `/rides/${encodeURIComponent(featuredGuide.slug)}`,
                  )
                : router.push("/rides")
            }
            style={({ pressed }) => [
              styles.hero,
              pressed && styles.heroPressed,
            ]}
          >
            {heroImage ? (
              <Image
                source={{ uri: heroImage }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={220}
              />
            ) : (
              <View style={styles.heroEmptyArt}>
                {guidesLoading || locationState === "locating" ? (
                  <ActivityIndicator color={design.color.orangeBright} />
                ) : (
                  <Feather
                    name="map"
                    size={52}
                    color={design.color.lineStrong}
                  />
                )}
              </View>
            )}
            <LinearGradient
              colors={[
                "rgba(0,0,0,0.0)",
                "rgba(0,0,0,0.42)",
                "rgba(0,0,0,0.94)",
              ]}
              locations={[0, 0.43, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.heroLabel}>
                <Text style={styles.heroLabelText}>
                  {featuredDistance !== null
                    ? "FEATURED NEAR YOU"
                    : featuredGuide
                      ? "FEATURED RIDE"
                      : locationState === "available"
                        ? "NO RIDES WITHIN 20 MI"
                        : locationState === "locating"
                          ? "LOCATING"
                          : "RIDE LIBRARY"}
                </Text>
              </View>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroBody} numberOfLines={1}>
                {featuredGuide
                  ? rideLocation(featuredGuide)
                  : "Curated & community routes"}
              </Text>
            </View>
          </Pressable>

          <View style={styles.actionsGrid}>
            <ActionCard
              icon={recording.isRecording ? "navigation" : "navigation"}
              title={recording.isRecording ? "Resume ride" : "Start ride"}
              detail={
                recording.isRecording
                  ? `${formatDistance(recording.liveDistanceMeters, settings.units)} · ${formatDuration(recording.liveDurationMs)}`
                  : ""
              }
              primary
              onPress={startOrResumeRide}
            />
            <ActionCard
              icon="git-merge"
              title="Build route"
              detail=""
              disabled={recording.isRecording}
              onPress={() =>
                router.push({ pathname: "/map", params: { plot: "1" } })
              }
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              regions.length
                ? router.push("/library")
                : router.push({
                    pathname: "/map",
                    params: { offline: "1" },
                  })
            }
            style={({ pressed }) => [
              styles.inlineReadinessRow,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.inlineReadinessLeft}>
              <View style={[styles.inlineReadinessDot, regions.length ? styles.inlineReadinessDotReady : undefined]} />
              <Text style={styles.inlineReadinessTitle}>
                {regions.length ? "Offline map ready" : "Offline map"}
              </Text>
              {regions.length > 0 && <Text style={styles.inlineReadinessSubtitle}>· {regions.length} saved</Text>}
            </View>
            <Text style={styles.inlineReadinessAction}>
              {regions.length ? "Manage" : "Save map"}
            </Text>
          </Pressable>

          {showPrimer ? (
            <View style={styles.primer}>
              <View style={styles.primerHeader}>
                <View style={styles.primerHeadingCopy}>
                  <Text style={styles.primerEyebrow}>YOUR TRAIL KIT</Text>
                  <Text style={styles.primerTitle}>
                    Built for the trailhead, not the feed.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Dismiss app introduction"
                  onPress={dismissPrimer}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.rowPressed]}
                >
                  <Feather name="x" size={19} color={design.color.textMuted} />
                </Pressable>
              </View>
              <View style={styles.primerRows}>
                <PrimerRow
                  icon="compass"
                  title="Find & follow"
                  detail="Curated rides and community GPX tracks"
                />
                <PrimerRow
                  icon="radio"
                  title="Record & share"
                  detail="Live progress links and ride waypoints"
                />
                <PrimerRow
                  icon="download-cloud"
                  title="Plan & go offline"
                  detail="Build a route and save maps before you ride"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={dismissPrimer}
                style={({ pressed }) => [
                  styles.primerButton,
                  pressed && styles.actionCardPressed,
                ]}
              >
                <Text style={styles.primerButtonText}>Got it</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.section}>
            <ScendersSectionHeading
              eyebrow="RIDE READY"
              title="Before signal drops"
            />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                regions.length
                  ? router.push("/library")
                  : router.push({
                      pathname: "/map",
                      params: { offline: "1" },
                    })
              }
              style={({ pressed }) => [
                styles.readinessRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.readinessIcon}>
                <Feather
                  name={regions.length ? "check" : "download"}
                  size={19}
                  color={
                    regions.length
                      ? design.color.success
                      : design.color.orangeBright
                  }
                />
              </View>
              <View style={styles.readinessCopy}>
                <Text style={styles.readinessTitle}>
                  {regions.length
                    ? `${regions.length} offline ${regions.length === 1 ? "area" : "areas"} ready`
                    : "Save an offline map"}
                </Text>
                <Text style={styles.readinessDetail} numberOfLines={1}>
                  {regions.length
                    ? `${offlineTiles.toLocaleString()} map tiles available without service`
                    : "Download the ride area before leaving coverage"}
                </Text>
              </View>
              <Text style={styles.readinessAction}>
                {regions.length ? "Manage" : "Save"}
              </Text>
              <Feather
                name="chevron-right"
                size={18}
                color={design.color.textFaint}
              />
            </Pressable>
          </View>

          {recentTracks.length ? (
            <View style={styles.section}>
              <ScendersSectionHeading
                title="Recent rides"
                actionLabel="View all"
                onAction={() => router.push("/tracks")}
              />
              <View style={styles.routeList}>
                {recentTracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    units={settings.units}
                    onPress={() =>
                      router.push({
                        pathname: "/map",
                        params: { follow: track.id },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {nearbyGuides.length ? (
            <View style={styles.section}>
              <ScendersSectionHeading
                title={lastLocation ? "More nearby rides" : "More rides"}
                actionLabel="View all"
                onAction={() => router.push("/rides")}
              />
              <View style={styles.routeList}>
                {nearbyGuides.map((guide) => (
                  <GuideRow key={guide.id} guide={guide} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.utilityStats}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/library")}
              style={({ pressed }) => [
                styles.utilityStat,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={styles.utilityNumber}>{datasets.length}</Text>
              <Text style={styles.utilityLabel}>SAVED GPX</Text>
            </Pressable>
            <View style={styles.utilityDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/waypoints")}
              style={({ pressed }) => [
                styles.utilityStat,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={styles.utilityNumber}>{waypoints.length}</Text>
              <Text style={styles.utilityLabel}>WAYPOINTS</Text>
            </Pressable>
            <View style={styles.utilityDivider} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/tracks")}
              style={({ pressed }) => [
                styles.utilityStat,
                pressed && styles.rowPressed,
              ]}
            >
              <Text style={styles.utilityNumber}>{tracks.length}</Text>
              <Text style={styles.utilityLabel}>MY RIDES</Text>
            </Pressable>
          </View>

          <Text style={styles.footerLine}>
            BUILT FOR DIRT · ASCEND. DESCEND. REPEAT.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: design.color.canvas, flex: 1 },
  content: {
    alignSelf: "center",
    paddingHorizontal: 18,
    width: "100%",
    maxWidth: 760,
  },
  taglineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 8,
    marginTop: 24,
  },
  tagline: {
    color: design.color.orangeBright,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  featuredGuideLabel: {
    marginBottom: 16,
  },
  featuredGuideLabelText: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: -1.0,
    lineHeight: 36,
  },
  locationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  locationHeaderText: {
    color: design.color.textMuted,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.0,
  },
  homeSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: design.color.surfaceRaised,
    borderRadius: design.radius.medium,
    borderColor: design.color.line,
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  homeSearchIcon: {
    marginRight: 10,
  },
  homeSearchInput: {
    flex: 1,
    color: design.color.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    height: "100%",
  },
  hero: {
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
    borderRadius: design.radius.medium,
    borderWidth: 1,
    height: 200,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 16,
  },
  heroPressed: { opacity: 0.91, transform: [{ scale: 0.995 }] },
  heroEmptyArt: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: design.color.surface,
    justifyContent: "center",
  },
  heroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroLabel: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    borderRadius: 4,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  heroLabelText: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.0,
  },
  heroCopy: { gap: 4 },
  heroBody: {
    color: design.color.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  actionsGrid: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionCard: {
    alignItems: "center",
    borderRadius: design.radius.medium,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  actionCardPrimary: {
    backgroundColor: design.color.orangeBright,
    borderColor: design.color.orangeBright,
  },
  actionCardSecondary: {
    backgroundColor: design.color.surfaceRaised,
    borderColor: design.color.line,
  },
  actionCardPressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  actionIcon: {
    marginRight: 8,
  },
  actionIconPrimary: {
    // Empty
  },
  actionIconSecondary: {
    // Empty
  },
  actionTitlePrimary: {
    color: design.color.canvas,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  actionTitle: {
    color: design.color.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  actionDetail: { display: "none" },
  actionDetailPrimary: { display: "none" },
  actionTopRow: { flexDirection: "row", alignItems: "center" },
  actionCopy: { marginLeft: 4 },
  inlineReadinessRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: design.color.lineStrong,
    marginTop: 8,
  },
  inlineReadinessLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineReadinessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: design.color.lineStrong,
    marginRight: 8,
  },
  inlineReadinessDotReady: {
    backgroundColor: design.color.success,
  },
  inlineReadinessTitle: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  inlineReadinessSubtitle: {
    color: design.color.textFaint,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginLeft: 6,
  },
  inlineReadinessAction: {
    color: design.color.orangeBright,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  primer: {
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
    borderRadius: design.radius.large,
    borderWidth: 1,
    marginTop: 28,
    overflow: "hidden",
    padding: 18,
  },
  primerHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  primerHeadingCopy: { flex: 1, paddingRight: 16 },
  primerEyebrow: {
    color: design.color.orangeBright,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  primerTitle: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 25,
    marginTop: 7,
  },
  primerRows: { marginTop: 18 },
  primerRow: {
    alignItems: "center",
    borderTopColor: design.color.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 13,
  },
  primerIcon: {
    alignItems: "center",
    backgroundColor: design.color.surfaceRaised,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  primerCopy: { flex: 1 },
  primerRowTitle: {
    color: design.color.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  primerRowDetail: {
    color: design.color.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  primerButton: {
    alignItems: "center",
    backgroundColor: design.color.text,
    borderRadius: 11,
    marginTop: 6,
    paddingVertical: 12,
  },
  primerButtonText: {
    color: design.color.black,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
  section: { gap: 14, marginTop: 30 },
  readinessRow: { display: "none" },
  readinessIcon: { display: "none" },
  readinessCopy: { display: "none" },
  readinessTitle: { display: "none" },
  readinessDetail: { display: "none" },
  readinessAction: { display: "none" },
  routeList: { borderTopColor: design.color.line, borderTopWidth: 1 },
  routeRow: {
    alignItems: "center",
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
    borderRadius: design.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 68,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeGlyph: {
    alignItems: "center",
    backgroundColor: design.color.surfaceRaised,
    borderRadius: 11,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  guideThumb: { borderRadius: 11, height: 44, width: 44 },
  routeCopy: { flex: 1 },
  routeTitle: {
    color: design.color.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 18,
  },
  routeMeta: {
    color: design.color.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  rowPressed: { opacity: 0.58 },
  utilityStats: { display: "none" },
  utilityStat: { display: "none" },
  utilityNumber: { display: "none" },
  utilityLabel: { display: "none" },
  utilityDivider: { display: "none" },
  footerLine: { display: "none" },
});
