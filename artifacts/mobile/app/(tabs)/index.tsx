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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ScendersSectionHeading,
  ScendersWordmark,
} from "@/components/ScendersChrome";
import { RideRoutePreview } from "@/components/RideRoutePreview";
import { scendersDesign as design } from "@/constants/scendersDesign";
import { useMaps } from "@/contexts/MapsContext";
import { useRecording } from "@/contexts/RecordingContext";
import { listRideGuides, type RideGuide } from "@/lib/rideForest";
import { formatDuration } from "@/lib/trackRecording";
import type { Track } from "@/lib/types";
import { formatDistance } from "@/lib/units";

const WEB_TOP_INSET = Platform.OS === "web" ? 28 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const HOME_PRIMER_KEY = "scenders.home-primer.v1";

type Coordinates = { latitude: number; longitude: number };

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
  const point = guide.trackCoordinates[0];
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
  const [showPrimer, setShowPrimer] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(HOME_PRIMER_KEY)
      .then((seen) => {
        if (mounted) setShowPrimer(seen !== "seen");
      })
      .catch(() => {});
    Location.getLastKnownPositionAsync()
      .then((location) => {
        if (!mounted || !location) return;
        setLastLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setGuidesLoading(true);
      listRideGuides()
        .then((next) => {
          if (mounted) setGuides(next);
        })
        .catch(() => {})
        .finally(() => {
          if (mounted) setGuidesLoading(false);
        });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const orderedGuides = useMemo(() => {
    if (!lastLocation) return guides;
    return [...guides].sort((a, b) => {
      const aDistance = guideDistance(a, lastLocation);
      const bDistance = guideDistance(b, lastLocation);
      if (aDistance === null && bDistance === null) return 0;
      if (aDistance === null) return 1;
      if (bDistance === null) return -1;
      return aDistance - bDistance;
    });
  }, [guides, lastLocation]);

  const featuredGuide = orderedGuides[0] ?? null;
  const nearbyGuides = orderedGuides.slice(1, 4);
  const featuredDistance =
    featuredGuide && lastLocation
      ? guideDistance(featuredGuide, lastLocation)
      : null;
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
          <View style={styles.header}>
            <ScendersWordmark />
            <Pressable
              accessibilityLabel="Open settings and more"
              accessibilityRole="button"
              onPress={() => router.push("/about")}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.rowPressed,
              ]}
            >
              <Feather name="menu" size={20} color={design.color.text} />
            </Pressable>
          </View>

          <View style={styles.taglineRow}>
            <View style={styles.taglineRule} />
            <Text style={styles.tagline}>ASCEND. DESCEND. REPEAT.</Text>
          </View>

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
            ) : featuredGuide ? (
              <View style={StyleSheet.absoluteFill}>
                <RideRoutePreview
                  points={featuredGuide.trackCoordinates}
                  height={318}
                />
              </View>
            ) : (
              <View style={styles.heroEmptyArt}>
                {guidesLoading ? (
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
                "rgba(0,0,0,0.08)",
                "rgba(0,0,0,0.42)",
                "rgba(0,0,0,0.94)",
              ]}
              locations={[0, 0.43, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.heroLabel}>
                <View style={styles.heroLabelDot} />
                <Text style={styles.heroLabelText}>
                  {featuredDistance !== null
                    ? `NEARBY · ${Math.max(1, Math.round(featuredDistance))} MI`
                    : featuredGuide
                      ? "FEATURED RIDE"
                      : "RIDE LIBRARY"}
                </Text>
              </View>
              <View style={styles.heroArrow}>
                <Feather
                  name="arrow-up-right"
                  size={18}
                  color={design.color.text}
                />
              </View>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLocation} numberOfLines={1}>
                {featuredGuide
                  ? rideLocation(featuredGuide)
                  : "CURATED + COMMUNITY ROUTES"}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {featuredGuide?.title || "Find your next line."}
              </Text>
              {featuredGuide ? (
                <View style={styles.heroMetaRow}>
                  {rideMeta(featuredGuide).map((item) => (
                    <View key={item} style={styles.heroMetaPill}>
                      <Text style={styles.heroMetaText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.heroBody}>
                  Browse ride guides and GPX tracks built for the map.
                </Text>
              )}
            </View>
          </Pressable>

          <View style={styles.actionsGrid}>
            <ActionCard
              icon={recording.isRecording ? "navigation" : "circle"}
              title={recording.isRecording ? "Resume ride" : "Start ride"}
              detail={
                recording.isRecording
                  ? `${formatDistance(recording.liveDistanceMeters, settings.units)} · ${formatDuration(recording.liveDurationMs)}`
                  : "Track GPS + share live"
              }
              primary
              onPress={startOrResumeRide}
            />
            <ActionCard
              icon="share-2"
              title="Build route"
              detail={
                recording.isRecording
                  ? "Finish current ride first"
                  : "Connect roads + trails"
              }
              disabled={recording.isRecording}
              onPress={() =>
                router.push({ pathname: "/map", params: { plot: "1" } })
              }
            />
          </View>

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
                eyebrow="YOUR ACTIVITY"
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
                eyebrow="KEEP EXPLORING"
                title="More rides"
                actionLabel="Explore"
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  taglineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 18,
    marginTop: 18,
  },
  taglineRule: {
    backgroundColor: design.color.orange,
    height: 2,
    width: 22,
  },
  tagline: {
    color: design.color.textFaint,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.7,
  },
  hero: {
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
    borderRadius: design.radius.hero,
    borderWidth: 1,
    height: 318,
    justifyContent: "space-between",
    overflow: "hidden",
    padding: 18,
  },
  heroPressed: { opacity: 0.91, transform: [{ scale: 0.995 }] },
  heroEmptyArt: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: design.color.surface,
    justifyContent: "center",
  },
  heroTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroLabel: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: design.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  heroLabelDot: {
    backgroundColor: design.color.orangeBright,
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  heroLabelText: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  heroArrow: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.52)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 20,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  heroCopy: { gap: 7 },
  heroLocation: {
    color: design.color.orangeBright,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.45,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 31,
    letterSpacing: -1.15,
    lineHeight: 35,
    maxWidth: 530,
  },
  heroBody: {
    color: design.color.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  heroMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 3 },
  heroMetaPill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: design.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroMetaText: {
    color: design.color.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
  },
  actionsGrid: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionCard: {
    borderRadius: design.radius.medium,
    borderWidth: 1,
    flex: 1,
    minHeight: 142,
    padding: 14,
  },
  actionCardPrimary: {
    backgroundColor: design.color.orange,
    borderColor: design.color.orange,
  },
  actionCardSecondary: {
    backgroundColor: design.color.surface,
    borderColor: design.color.line,
  },
  actionCardPressed: { opacity: 0.82 },
  disabled: { opacity: 0.42 },
  actionIcon: {
    alignItems: "center",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  actionIconPrimary: { backgroundColor: "rgba(0,0,0,0.14)" },
  actionIconSecondary: { backgroundColor: design.color.surfaceRaised },
  actionTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionCopy: { flex: 1, justifyContent: "flex-end", paddingTop: 18 },
  actionTitle: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    lineHeight: 21,
  },
  actionTitlePrimary: { color: design.color.black },
  actionDetail: {
    color: design.color.textMuted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  actionDetailPrimary: { color: "rgba(0,0,0,0.66)" },
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
  readinessRow: {
    alignItems: "center",
    borderBottomColor: design.color.line,
    borderTopColor: design.color.line,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  readinessIcon: {
    alignItems: "center",
    backgroundColor: design.color.surface,
    borderRadius: 11,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  readinessCopy: { flex: 1 },
  readinessTitle: {
    color: design.color.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  readinessDetail: {
    color: design.color.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  readinessAction: {
    color: design.color.orangeBright,
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  routeList: { borderTopColor: design.color.line, borderTopWidth: 1 },
  routeRow: {
    alignItems: "center",
    borderBottomColor: design.color.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
  },
  routeGlyph: {
    alignItems: "center",
    backgroundColor: design.color.surface,
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
  utilityStats: {
    alignItems: "center",
    borderColor: design.color.line,
    borderRadius: design.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 30,
    paddingVertical: 15,
  },
  utilityStat: { alignItems: "center", flex: 1 },
  utilityNumber: {
    color: design.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  utilityLabel: {
    color: design.color.textFaint,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.1,
    marginTop: 4,
  },
  utilityDivider: { backgroundColor: design.color.line, height: 28, width: 1 },
  footerLine: {
    color: design.color.textFaint,
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1.25,
    marginTop: 28,
    textAlign: "center",
  },
});
