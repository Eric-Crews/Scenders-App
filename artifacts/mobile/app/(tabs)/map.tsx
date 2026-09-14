import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MapViewComponent, {
  type MapViewHandle,
  type OfflineManifest,
} from "@/components/MapView";
import ElevationProfile from "@/components/ElevationProfile";
import { LayersSheet } from "@/components/LayersSheet";
import { MapControl } from "@/components/MapControl";
import { Sheet } from "@/components/Sheet";
import { useMaps } from "@/contexts/MapsContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useColors } from "@/hooks/useColors";
import {
  getCommunityDataset,
  getTrailGuideSource,
  publishTrackAsCommunityDataset,
  shareCommunityDataset,
  uploadPhoto,
} from "@/lib/community";
import { pickPhoto, takePhoto } from "@/lib/photos";
import { formatDuration } from "@/lib/trackRecording";
import {
  formatDistance,
  formatElevation,
  offRouteThresholdPresets,
} from "@/lib/units";
import { ALL_LAYERS } from "@/lib/mapLayers";
import {
  distanceToNextPeak,
  elevationStats,
  fetchElevations,
  nextClimb,
  remainingElevation,
} from "@/lib/elevation";
import { pathLengthMeters, routeProgress } from "@/lib/geo";
import {
  BACK_ON_RATIO,
  announceOffRoute,
  clearFollowConfig,
  readFollowState,
  requestBackgroundFollowPermission,
  setFollowConfig,
  startBackgroundFollow,
  stopBackgroundFollow,
  writeFollowState,
} from "@/lib/backgroundFollow";
import { snapshotFollowedRoute } from "@/lib/liveRouteSnapshot";
import type { Dataset, Track, TrackPoint } from "@/lib/types";
import {
  datasetRouteCoords,
  datasetToFollowTrack,
  routePointsToTrackPoints,
} from "@/lib/datasetRoute";
import {
  buildOfflineManifest,
  downloadTilesForLayers,
  tileCacheSize,
  tilesForBounds,
  type DownloadProgress,
} from "@/lib/tiles";

type ViewState = {
  lat: number;
  lng: number;
  zoom: number;
  bounds: [number, number, number, number];
};

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapViewHandle>(null);
  const {
    datasets,
    waypoints,
    tracks,
    addDataset,
    addWaypoint,
    addRegion,
    addTrack,
    updateTrack,
    layers,
    setBaseLayer,
    toggleOverlay,
    settings,
    updateSettings,
  } = useMaps();
  const recording = useRecording();
  const params = useLocalSearchParams<{
    start?: string;
    plot?: string;
    offline?: string;
    follow?: string;
    edit?: string;
    dataset?: string;
    followDataset?: string;
    communityGuide?: string;
  }>();

  const [tracking, setTracking] = useState(false);
  const [me, setMe] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  const [offlineManifest, setOfflineManifest] = useState<OfflineManifest>({});
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [pendingWaypoint, setPendingWaypoint] = useState<{
    lat: number;
    lng: number;
    photoUri?: string;
    trackId?: string;
  } | null>(null);
  const [waypointName, setWaypointName] = useState("");
  const [waypointNotes, setWaypointNotes] = useState("");
  const [waypointPublish, setWaypointPublish] = useState(false);
  const [downloadZoom, setDownloadZoom] = useState(2);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [downloadName, setDownloadName] = useState("");
  const [cacheStats, setCacheStats] = useState<{
    count: number;
    bytes: number;
  }>({ count: 0, bytes: 0 });

  // Route plotting
  const [plotMode, setPlotMode] = useState(false);
  const [plotPoints, setPlotPoints] = useState<{ lat: number; lng: number }[]>(
    [],
  );
  const [plotElevations, setPlotElevations] = useState<(number | null)[]>([]);
  const [plotElevLoading, setPlotElevLoading] = useState(false);
  // Snapshots of plotPoints captured *before* each edit (add, move, insert,
  // delete, clear) so Undo can step back through the full edit history rather
  // than only popping the last-appended point. Elevations aren't snapshotted —
  // the plotPoints effect re-fetches them whenever the vertices change.
  const plotHistoryRef = useRef<{ lat: number; lng: number }[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [savePlotOpen, setSavePlotOpen] = useState(false);
  const [plotName, setPlotName] = useState("");
  const [plotDescription, setPlotDescription] = useState("");
  const [plotShareEnabled, setPlotShareEnabled] = useState(false);
  const [plotShareAuthor, setPlotShareAuthor] = useState("");
  // Post-recording publish sheet
  const [postSaveTrack, setPostSaveTrack] = useState<Track | null>(null);
  const [postSavePublishing, setPostSavePublishing] = useState(false);
  const [postSaveAuthor, setPostSaveAuthor] = useState("");
  const [postSaveShareEnabled, setPostSaveShareEnabled] = useState(false);
  // Live activity sharing uses a private capability link copied to the device.
  const [liveShareOpen, setLiveShareOpen] = useState(false);
  const [liveShareName, setLiveShareName] = useState("Live activity");
  const [liveShareOwnerName, setLiveShareOwnerName] = useState("");
  const [liveShareSending, setLiveShareSending] = useState(false);
  const [liveReply, setLiveReply] = useState("");
  const [livePanelExpanded, setLivePanelExpanded] = useState(true);
  const [seenViewerMessageIds, setSeenViewerMessageIds] = useState<string[]>(
    [],
  );
  const [selectedPlotIndex, setSelectedPlotIndex] = useState<number | null>(
    null,
  );
  // Id of the saved track currently being re-edited (null when plotting a new
  // route). Drives whether Save updates the existing track or creates one.
  const [editTrackId, setEditTrackId] = useState<string | null>(null);

  // Multi-track tap — swipeable card picker when tracks overlap
  const [trackTapSheet, setTrackTapSheet] = useState<Track[] | null>(null);

  // Route following
  const [followTrack, setFollowTrack] = useState<Track | null>(null);
  // Tapped dataset detail sheet — community datasets are routes, so we surface
  // distance/elevation and let the user follow them just like a track.
  const [datasetDetail, setDatasetDetail] = useState<{
    dataset: Dataset;
    points: TrackPoint[];
  } | null>(null);
  const [datasetElevLoading, setDatasetElevLoading] = useState(false);
  // Monotonic token so only the latest dataset tap controls elevation state —
  // overlapping taps otherwise let a stale request flip loading/points.
  const datasetElevReqRef = useRef(0);
  // Tracks whether we last considered the user off-route, so the haptic/voice
  // alert fires only once per crossing (not on every GPS tick while off-route).
  const wasOffRouteRef = useRef(false);
  // True when background-location updates are running, so off-route alerts keep
  // firing with the phone pocketed/locked. Drives the active-follow indicator.
  const [bgFollowActive, setBgFollowActive] = useState(false);

  const activeLiveActivity =
    recording.liveActivity?.status === "active" ? recording.liveActivity : null;
  const viewerMessages =
    activeLiveActivity?.messages.filter(
      (message) => message.sender === "viewer",
    ) ?? [];
  const unreadViewerMessageCount = viewerMessages.filter(
    (message) => !seenViewerMessageIds.includes(message.id),
  ).length;
  const queuedLiveUpdateCount =
    (activeLiveActivity?.pendingPoints.length ?? 0) +
    (activeLiveActivity?.pendingMessages.length ?? 0);
  const liveSyncState = activeLiveActivity?.syncState ?? "up-to-date";
  const liveSyncHint = !activeLiveActivity
    ? ""
    : activeLiveActivity.pendingRevoke
      ? "The request to stop sharing will finish when a connection is available."
      : activeLiveActivity.pendingEnd
        ? "The final live update will finish when a connection is available."
        : liveSyncState === "needs-attention"
          ? "Live sharing needs attention before it can sync. Your updates stay on this phone."
          : liveSyncState === "waiting-for-network"
            ? `${queuedLiveUpdateCount} update${queuedLiveUpdateCount === 1 ? "" : "s"} waiting for a network connection.`
            : liveSyncState === "retrying"
              ? `${queuedLiveUpdateCount} update${queuedLiveUpdateCount === 1 ? "" : "s"} will retry shortly.`
              : queuedLiveUpdateCount
                ? `${queuedLiveUpdateCount} update${queuedLiveUpdateCount === 1 ? "" : "s"} sending securely.`
                : "Private link is up to date.";

  useEffect(() => {
    if (!livePanelExpanded || !activeLiveActivity) return;
    const ids = activeLiveActivity.messages
      .filter((message) => message.sender === "viewer")
      .map((message) => message.id);
    if (!ids.length) return;
    setSeenViewerMessageIds((seen) => {
      const next = [...new Set([...seen, ...ids])].slice(-100);
      return next.length === seen.length ? seen : next;
    });
  }, [activeLiveActivity, livePanelExpanded]);

  const openLiveShare = () => {
    if (activeLiveActivity) {
      setLivePanelExpanded(true);
      return;
    }
    if (Platform.OS === "web") {
      Alert.alert(
        "Live sharing works in the mobile app",
        "Open Scenders Ride on your phone to create and protect a private live link.",
      );
      return;
    }
    setLiveShareName(recording.liveActivity?.name ?? "Live activity");
    setLiveShareOwnerName(recording.liveActivity?.ownerDisplayName ?? "");
    setLiveShareOpen(true);
  };

  const copyLiveLink = async (url?: string) => {
    const link = url ?? recording.liveActivity?.url;
    if (!link) {
      Alert.alert(
        "Preparing private link",
        "Your sharing link is refreshing. Try again in a moment.",
      );
      return;
    }
    try {
      await Clipboard.setStringAsync(link);
      Alert.alert(
        "Private link copied",
        "Paste it into your preferred SMS or messaging app.",
      );
    } catch {
      Alert.alert("Couldn’t copy the link", "Try again in a moment.");
    }
  };

  const createAndCopyLiveLink = async () => {
    const name = liveShareName.trim();
    const ownerDisplayName = liveShareOwnerName.trim();
    if (!name || !ownerDisplayName) {
      Alert.alert(
        "Check the sharing details",
        "Enter an activity name and your display name.",
      );
      return;
    }
    setLiveShareSending(true);
    try {
      const session = await recording.startLiveShare({
        name,
        ownerDisplayName,
        followedRoute: snapshotFollowedRoute(followTrack),
      });
      setLiveShareOpen(false);
      setLiveReply("");
      setLivePanelExpanded(true);
      await copyLiveLink(session.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Couldn't create the private link", message);
    } finally {
      setLiveShareSending(false);
    }
  };

  const editingTrack = useMemo(
    () =>
      editTrackId ? (tracks.find((t) => t.id === editTrackId) ?? null) : null,
    [editTrackId, tracks],
  );

  const plotDistanceMeters = useMemo(
    () => pathLengthMeters(plotPoints),
    [plotPoints],
  );
  const plotElevStats = useMemo(
    () => elevationStats(plotElevations),
    [plotElevations],
  );
  const plotElevGain = plotElevStats.gainMeters;
  const plotElevLoss = plotElevStats.lossMeters;
  // Pair each plotted vertex with its fetched ground elevation so the profile
  // chart can render distance-vs-elevation before the route is even saved.
  const plotProfilePoints = useMemo<TrackPoint[]>(
    () =>
      plotPoints.map((p, i) => ({
        lat: p.lat,
        lng: p.lng,
        t: i,
        alt: plotElevations[i] ?? null,
      })),
    [plotPoints, plotElevations],
  );

  const followProgress = useMemo(() => {
    if (!followTrack || !me) return null;
    return routeProgress(
      followTrack.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      { lat: me.latitude, lng: me.longitude },
    );
  }, [followTrack, me]);

  // Total length of the followed route, so the elevation profile can place the
  // live "you are here" marker at (total − remaining) cumulative distance.
  const followTrackLengthMeters = useMemo(
    () => (followTrack ? pathLengthMeters(followTrack.points) : 0),
    [followTrack],
  );
  const followMarkerDist = useMemo(() => {
    if (!followProgress) return null;
    return Math.max(
      0,
      followTrackLengthMeters - followProgress.distanceRemainingMeters,
    );
  }, [followProgress, followTrackLengthMeters]);

  // Climb still ahead from the projected position to the route's end, reusing
  // followMarkerDist so the readout tracks the same point as the profile marker.
  const followClimbRemaining = useMemo(
    () =>
      followTrack
        ? remainingElevation(followTrack.points, followMarkerDist)
        : null,
    [followTrack, followMarkerDist],
  );

  // Distance from the projected position to the next high point ahead, so the
  // hiker can pace effort toward the next summit. Reuses followMarkerDist and
  // the same altitude samples as the climb-left readout above.
  const followNextPeakDist = useMemo(
    () =>
      followTrack
        ? distanceToNextPeak(followTrack.points, followMarkerDist)
        : null,
    [followTrack, followMarkerDist],
  );

  // The next significant climb whose summit is still ahead, highlighted on the
  // map and shaded on the elevation profile so the hiker can see where the next
  // big effort begins.
  const followNextClimb = useMemo(
    () =>
      followTrack ? nextClimb(followTrack.points, followMarkerDist) : null,
    [followTrack, followMarkerDist],
  );

  // Push the climb highlight to the map only when the highlighted stretch
  // actually changes (the whole base→summit segment is stable until crested),
  // so per-GPS-tick recomputes don't re-inject an identical polyline.
  const climbHighlightKey =
    followTrack && followNextClimb
      ? `${followNextClimb.startDist.toFixed(1)}:${followNextClimb.endDist.toFixed(1)}`
      : null;
  const lastClimbKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (climbHighlightKey === lastClimbKeyRef.current) return;
    lastClimbKeyRef.current = climbHighlightKey;
    mapRef.current?.setClimbHighlight(followNextClimb?.path ?? null);
  }, [climbHighlightKey, followNextClimb]);

  // Foreground off-route detection: fires the haptic/voice alert once per
  // crossing while the app is open. When backgrounded the screen freezes, so
  // the TaskManager background task (lib/backgroundFollow) takes over — both
  // share the persisted `wasOffRoute` latch so a crossing never double-fires.
  useEffect(() => {
    if (!followTrack) {
      // Reset so re-entering follow mode starts from a clean "on route" state.
      wasOffRouteRef.current = false;
      void writeFollowState({ wasOffRoute: false });
      Speech.stop();
      return;
    }
    if (!followProgress) return;
    // While backgrounded the background task owns alerting; skip here so we
    // don't double-announce the same crossing.
    if (AppState.currentState !== "active") return;
    const off = followProgress.offRouteMeters;
    const threshold = settings.offRouteThreshold;
    if (!wasOffRouteRef.current && off > threshold) {
      // Track the physical state regardless so toggling alerts mid-trip
      // doesn't double-fire; only the announcement itself respects the toggle.
      wasOffRouteRef.current = true;
      void writeFollowState({ wasOffRoute: true });
      if (settings.offRouteAlerts)
        announceOffRoute(true, settings.offRouteVoice);
    } else if (wasOffRouteRef.current && off < threshold * BACK_ON_RATIO) {
      wasOffRouteRef.current = false;
      void writeFollowState({ wasOffRoute: false });
      if (settings.offRouteAlerts)
        announceOffRoute(false, settings.offRouteVoice);
    }
  }, [
    followTrack,
    followProgress,
    settings.offRouteAlerts,
    settings.offRouteThreshold,
    settings.offRouteVoice,
  ]);

  // Mirror the active follow config (route + threshold + toggles) to storage so
  // the background task — which can't read React state — always has the latest.
  useEffect(() => {
    if (!followTrack || followTrack.points.length < 2) {
      void clearFollowConfig();
      return;
    }
    void setFollowConfig({
      route: followTrack.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      threshold: settings.offRouteThreshold,
      alerts: settings.offRouteAlerts,
      voice: settings.offRouteVoice,
    });
  }, [
    followTrack,
    settings.offRouteThreshold,
    settings.offRouteAlerts,
    settings.offRouteVoice,
  ]);

  // Battery-conscious background tracking: only run the background-location task
  // while actively following with alerts on. Requests "Always" permission the
  // first time; on denial (or in Expo Go) it silently degrades to foreground.
  useEffect(() => {
    let cancelled = false;
    if (followTrack && tracking && settings.offRouteAlerts) {
      (async () => {
        const granted = await requestBackgroundFollowPermission();
        if (cancelled) return;
        if (!granted) {
          setBgFollowActive(false);
          return;
        }
        const ok = await startBackgroundFollow();
        if (!cancelled) setBgFollowActive(ok);
      })();
    } else {
      setBgFollowActive(false);
      void stopBackgroundFollow();
    }
    return () => {
      cancelled = true;
    };
  }, [followTrack, tracking, settings.offRouteAlerts]);

  // On returning to the foreground, re-sync the in-memory latch from whatever
  // the background task last persisted so the next crossing is judged correctly.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && followTrack) {
        void readFollowState().then((s) => {
          wasOffRouteRef.current = s.wasOffRoute;
        });
      }
    });
    return () => sub.remove();
  }, [followTrack]);

  // Load cached tiles into the map on mount
  useEffect(() => {
    (async () => {
      const manifest = await buildOfflineManifest();
      setOfflineManifest(manifest);
      const stats = await tileCacheSize();
      setCacheStats(stats);
    })();
  }, []);

  // Continuous location tracking when enabled
  useEffect(() => {
    if (!tracking) {
      setMe(null);
      mapRef.current?.setMe(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let webWatchId: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (!("geolocation" in navigator)) {
            Alert.alert("Location unavailable");
            setTracking(false);
            return;
          }
          webWatchId = navigator.geolocation.watchPosition(
            (pos) => {
              if (cancelled) return;
              const loc = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              };
              setMe(loc);
              mapRef.current?.setMe(loc);
            },
            () => {
              Alert.alert("Couldn't get location");
              setTracking(false);
            },
            { enableHighAccuracy: true, maximumAge: 1000 },
          );
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location permission denied",
            "Enable location access in Settings to track your position on the map.",
          );
          setTracking(false);
          return;
        }
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const initLoc = {
          latitude: first.coords.latitude,
          longitude: first.coords.longitude,
          accuracy: first.coords.accuracy ?? undefined,
        };
        setMe(initLoc);
        mapRef.current?.setMe(initLoc);
        mapRef.current?.flyTo(initLoc.latitude, initLoc.longitude, 15);
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 2000,
          },
          (pos) => {
            const loc = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? undefined,
            };
            setMe(loc);
            mapRef.current?.setMe(loc);
          },
        );
      } catch {
        setTracking(false);
      }
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
      if (webWatchId !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(webWatchId);
      }
    };
  }, [tracking]);

  // Clear the elevation-scrub highlight marker whenever the save sheet closes.
  useEffect(() => {
    if (!savePlotOpen) mapRef.current?.setElevationMarker(null);
  }, [savePlotOpen]);

  // Same for the dataset detail sheet — drop any scrub marker on close.
  useEffect(() => {
    if (!datasetDetail) mapRef.current?.setElevationMarker(null);
  }, [datasetDetail]);

  // Refit on focus
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => mapRef.current?.invalidate(), 100);
      return () => clearTimeout(t);
    }, []),
  );

  // Fetch ground elevation for plotted vertices (debounced, online only).
  useEffect(() => {
    if (!plotMode || plotPoints.length === 0) {
      setPlotElevations([]);
      setPlotElevLoading(false);
      return;
    }
    if (!onlineEnabled) {
      // Keep any already-known elevations (e.g. those seeded when re-opening a
      // saved route to edit) — offline we can't refetch, so don't wipe them.
      setPlotElevLoading(false);
      return;
    }
    let cancelled = false;
    setPlotElevLoading(true);
    const handle = setTimeout(async () => {
      const elevs = await fetchElevations(plotPoints);
      if (!cancelled) {
        setPlotElevations(elevs);
        setPlotElevLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [plotMode, plotPoints, onlineEnabled]);

  // Start following a track when navigated here with a ?follow=<id> param.
  useEffect(() => {
    const raw = params.follow;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    const target = tracks.find((t) => t.id === id);
    // Wait for tracks to hydrate before giving up — clear the param only once we
    // have actually found (or definitively can't use) the requested track.
    if (!target) return;
    if (target.points.length >= 2) {
      setPlotMode(false);
      setFollowTrack(target);
      if (!tracking) setTracking(true);
      let west = Infinity,
        south = Infinity,
        east = -Infinity,
        north = -Infinity;
      for (const p of target.points) {
        if (p.lng < west) west = p.lng;
        if (p.lat < south) south = p.lat;
        if (p.lng > east) east = p.lng;
        if (p.lat > north) north = p.lat;
      }
      mapRef.current?.fitBounds([west, south, east, north]);
    } else {
      Alert.alert(
        "Can't follow this track",
        "It needs at least two points to follow.",
      );
    }
    router.setParams({ follow: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.follow, tracks]);

  // Re-open a saved route in plot-edit mode when navigated here with ?edit=<id>.
  useEffect(() => {
    const raw = params.edit;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    const target = tracks.find((t) => t.id === id);
    // Wait for tracks to hydrate before giving up (same rationale as ?follow=).
    if (!target) return;
    enterEditMode(target);
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity;
    for (const p of target.points) {
      if (p.lng < west) west = p.lng;
      if (p.lat < south) south = p.lat;
      if (p.lng > east) east = p.lng;
      if (p.lat > north) north = p.lat;
    }
    if (Number.isFinite(west)) {
      mapRef.current?.fitBounds([west, south, east, north]);
    }
    router.setParams({ edit: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.edit, tracks]);

  const visibleDatasets = useMemo(
    () => datasets.filter((d) => d.visible),
    [datasets],
  );

  const handleTrackTap = useCallback(
    (ids: string[]) => {
      const found = tracks.filter((t) => ids.includes(t.id));
      if (!found.length) return;
      setTrackTapSheet(found);
      mapRef.current?.highlightTrack(found[0].id);
    },
    [tracks],
  );

  // A community dataset is a route, so tapping it opens a detail sheet (distance,
  // elevation, point count) and lets the user follow it like any track. When the
  // route has no embedded altitude and we're online, backfill elevations so the
  // profile and climb stats work — mirrors how plotted routes fetch elevation.
  const handleDatasetTap = useCallback(
    (id: string) => {
      const ds = datasets.find((d) => d.id === id);
      if (!ds) return;
      const token = ++datasetElevReqRef.current;
      const points = routePointsToTrackPoints(datasetRouteCoords(ds.geojson));
      setDatasetDetail({ dataset: ds, points });
      const hasAlt = points.some((p) => typeof p.alt === "number");
      if (onlineEnabled && !hasAlt && points.length >= 2) {
        setDatasetElevLoading(true);
        fetchElevations(points.map((p) => ({ lat: p.lat, lng: p.lng })))
          .then((alts) => {
            if (datasetElevReqRef.current !== token) return;
            setDatasetDetail((cur) =>
              cur && cur.dataset.id === id
                ? {
                    ...cur,
                    points: cur.points.map((p, i) => ({
                      ...p,
                      alt: alts[i] ?? p.alt ?? null,
                    })),
                  }
                : cur,
            );
          })
          .catch(() => {
            // Elevation is best-effort; the route still follows without it.
          })
          .finally(() => {
            // Only the most recent request may clear the loading state.
            if (datasetElevReqRef.current === token)
              setDatasetElevLoading(false);
          });
      } else {
        setDatasetElevLoading(false);
      }
    },
    [datasets, onlineEnabled],
  );

  // Turn a saved route into the active follow target, reusing the existing
  // follow-mode panel (remaining distance, off-route alerts, elevation, GPS dot).
  const startFollowingDataset = useCallback(
    (dataset: Dataset, points: TrackPoint[]) => {
      if (points.length < 2) return;
      const track = datasetToFollowTrack(dataset, points);
      setPlotMode(false);
      setFollowTrack(track);
      if (!tracking) setTracking(true);
      let west = Infinity,
        south = Infinity,
        east = -Infinity,
        north = -Infinity;
      for (const p of track.points) {
        if (p.lng < west) west = p.lng;
        if (p.lat < south) south = p.lat;
        if (p.lng > east) east = p.lng;
        if (p.lat > north) north = p.lat;
      }
      if (Number.isFinite(west)) {
        mapRef.current?.fitBounds([west, south, east, north]);
      }
    },
    [tracking],
  );

  const followDataset = () => {
    if (!datasetDetail || datasetDetail.points.length < 2) return;
    startFollowingDataset(datasetDetail.dataset, datasetDetail.points);
    setDatasetDetail(null);
  };

  // Distance / elevation summary for the dataset detail sheet.
  const datasetDistanceMeters = useMemo(
    () => (datasetDetail ? pathLengthMeters(datasetDetail.points) : 0),
    [datasetDetail],
  );
  const datasetElevStats = useMemo(
    () =>
      elevationStats(
        (datasetDetail?.points ?? []).map((p) =>
          typeof p.alt === "number" ? p.alt : null,
        ),
      ),
    [datasetDetail],
  );
  const datasetHasElevation = useMemo(
    () => (datasetDetail?.points ?? []).some((p) => typeof p.alt === "number"),
    [datasetDetail],
  );
  // Extract embedded waypoints (Point features marked _waypointMarker) from
  // the dataset GeoJSON so they can be listed in the detail sheet.
  const datasetWaypoints = useMemo(
    () =>
      (datasetDetail?.dataset.geojson.features ?? []).filter(
        (f) => f.properties?.["_waypointMarker"] === true,
      ),
    [datasetDetail],
  );

  // Focus a dataset on the map when navigated here with ?dataset=<id> (e.g. the
  // "View on Map" action in the Library). Fits the route's extent and opens its
  // detail sheet, reusing the same flow as tapping it directly.
  useEffect(() => {
    const raw = params.dataset;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    const ds = datasets.find((d) => d.id === id);
    // Wait for datasets to hydrate before giving up (same as ?follow=/?edit=).
    if (!ds) return;
    handleDatasetTap(id);
    let bounds = ds.bounds;
    if (!bounds) {
      const coords = datasetRouteCoords(ds.geojson);
      let west = Infinity,
        south = Infinity,
        east = -Infinity,
        north = -Infinity;
      for (const p of coords) {
        if (p.lng < west) west = p.lng;
        if (p.lat < south) south = p.lat;
        if (p.lng > east) east = p.lng;
        if (p.lat > north) north = p.lat;
      }
      if (Number.isFinite(west)) bounds = [west, south, east, north];
    }
    if (bounds) mapRef.current?.fitBounds(bounds);
    router.setParams({ dataset: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.dataset, datasets]);

  // Scenders ride cards can launch directly into route following after saving
  // the RideForest track as a normal on-device dataset.
  useEffect(() => {
    const raw = params.followDataset;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;
    const points = routePointsToTrackPoints(
      datasetRouteCoords(dataset.geojson),
    );
    if (points.length >= 2) {
      startFollowingDataset(dataset, points);
    } else {
      Alert.alert("Can’t follow this ride", "Its route track is unavailable.");
    }
    router.setParams({ followDataset: undefined });
  }, [datasets, params.followDataset, startFollowingDataset]);

  // Resolve a trail-guide deep link (?communityGuide=<slug>) delivered by the
  // native-intent redirector. The flow is:
  //   1. Ask the server which community-dataset id backs this guide slug.
  //   2. If the dataset is already imported, focus it via the existing dataset
  //      tap flow (handleDatasetTap + fitBounds).
  //   3. If it is absent, import it with addDataset, then focus it.
  //   4. Errors (guide not found / network) are shown as an Alert and the param
  //      is cleared so repeated failures don't retry on every datasets change.
  // A ref guards against concurrent invocations when `datasets` re-renders
  // while the async resolution is still in flight.
  const communityGuideResolvingRef = useRef<string | null>(null);
  useEffect(() => {
    const raw = params.communityGuide;
    const slug = Array.isArray(raw) ? raw[0] : raw;
    if (!slug) return;
    // Already resolving this slug — wait for it.
    if (communityGuideResolvingRef.current === slug) return;
    communityGuideResolvingRef.current = slug;

    (async () => {
      try {
        // Step 1: resolve slug → datasetId via the server endpoint.
        const { datasetId } = await getTrailGuideSource(slug);

        // Step 2: check whether this dataset is already in the local library.
        const existing = datasets.find(
          (d) => d.communityId === datasetId || d.id === datasetId,
        );

        // Step 3: import if absent (guard against double-import with a second
        // check inside the async block — datasets may have changed since the
        // effect fired).
        let resolvedDs: import("@/lib/types").Dataset;
        if (existing) {
          resolvedDs = existing;
        } else {
          const detail = await getCommunityDataset(datasetId);
          const importBounds: [number, number, number, number] | undefined =
            detail.boundsWest != null &&
            detail.boundsSouth != null &&
            detail.boundsEast != null &&
            detail.boundsNorth != null
              ? [
                  detail.boundsWest,
                  detail.boundsSouth,
                  detail.boundsEast,
                  detail.boundsNorth,
                ]
              : undefined;
          resolvedDs = addDataset(
            detail.name,
            detail.format,
            detail.geojson,
            importBounds,
            {
              communityId: detail.id,
              communityKind:
                detail.kind === "trail" || detail.kind === "road"
                  ? detail.kind
                  : undefined,
            },
          );
        }

        // Step 4: focus the dataset (open detail sheet + fit map).
        handleDatasetTap(resolvedDs.id);
        let bounds = resolvedDs.bounds;
        if (!bounds) {
          const coords = datasetRouteCoords(resolvedDs.geojson);
          let west = Infinity,
            south = Infinity,
            east = -Infinity,
            north = -Infinity;
          for (const p of coords) {
            if (p.lng < west) west = p.lng;
            if (p.lat < south) south = p.lat;
            if (p.lng > east) east = p.lng;
            if (p.lat > north) north = p.lat;
          }
          if (Number.isFinite(west)) bounds = [west, south, east, north];
        }
        if (bounds) mapRef.current?.fitBounds(bounds);
      } catch (err) {
        Alert.alert(
          "Trail guide unavailable",
          err instanceof Error
            ? err.message
            : "Could not load the trail guide.",
        );
      } finally {
        communityGuideResolvingRef.current = null;
        router.setParams({ communityGuide: undefined });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.communityGuide, datasets]);

  // Capture the current vertices before an edit so Undo can step back to them.
  const pushPlotHistory = (snapshot: { lat: number; lng: number }[]) => {
    plotHistoryRef.current.push(snapshot);
    setCanUndo(true);
  };

  const handlePlotTap = (lat: number, lng: number) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    pushPlotHistory(plotPoints);
    setPlotPoints((prev) => [...prev, { lat, lng }]);
  };

  // Drag an existing vertex to a new spot.
  const handlePlotMove = (index: number, lat: number, lng: number) => {
    pushPlotHistory(plotPoints);
    setPlotPoints((prev) =>
      prev.map((p, i) => (i === index ? { lat, lng } : p)),
    );
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Insert a new vertex between point `index` and `index + 1`.
  const handlePlotInsert = (index: number, lat: number, lng: number) => {
    pushPlotHistory(plotPoints);
    setPlotPoints((prev) => {
      const next = prev.slice();
      next.splice(index + 1, 0, { lat, lng });
      return next;
    });
    // Indices after the insert shift, so drop any stale selection.
    setSelectedPlotIndex(null);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Tap a vertex to select it (or tap again to deselect).
  const handlePlotVertexTap = (index: number) => {
    setSelectedPlotIndex((cur) => (cur === index ? null : index));
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const deleteSelectedPlotPoint = () => {
    if (selectedPlotIndex === null) return;
    pushPlotHistory(plotPoints);
    setPlotPoints((prev) => prev.filter((_, i) => i !== selectedPlotIndex));
    setSelectedPlotIndex(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  // Pop the last snapshot off the edit history, restoring the vertices to their
  // state before the most recent edit of any kind.
  const undoPlotEdit = () => {
    const prev = plotHistoryRef.current.pop();
    if (!prev) return;
    setPlotPoints(prev);
    setSelectedPlotIndex(null);
    setCanUndo(plotHistoryRef.current.length > 0);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const enterPlotMode = () => {
    setFollowTrack(null);
    setEditTrackId(null);
    setPlotPoints([]);
    setPlotElevations([]);
    setSelectedPlotIndex(null);
    plotHistoryRef.current = [];
    setCanUndo(false);
    setPlotName("");
    setPlotDescription("");
    setPlotMode(true);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  // Re-open an already-saved route into plot-edit mode, pre-loaded with its
  // existing vertices and (when present) their ground elevations.
  const enterEditMode = (track: Track) => {
    setFollowTrack(null);
    setEditTrackId(track.id);
    setPlotPoints(track.points.map((p) => ({ lat: p.lat, lng: p.lng })));
    setPlotElevations(
      track.points.map((p) => (typeof p.alt === "number" ? p.alt : null)),
    );
    setSelectedPlotIndex(null);
    plotHistoryRef.current = [];
    setCanUndo(false);
    setPlotName(track.name);
    setPlotDescription(track.description ?? "");
    setPlotMode(true);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const exitPlotMode = () => {
    setPlotMode(false);
    setEditTrackId(null);
    setPlotPoints([]);
    setPlotElevations([]);
    setSelectedPlotIndex(null);
    plotHistoryRef.current = [];
    setCanUndo(false);
  };

  // Home launches directly into the relevant map workflow. These route flags
  // keep the underlying map tools unchanged while giving the new Home screen
  // clear, single-purpose actions.
  useEffect(() => {
    const startRequested = Array.isArray(params.start)
      ? params.start[0]
      : params.start;
    const plotRequested = Array.isArray(params.plot)
      ? params.plot[0]
      : params.plot;
    const offlineRequested = Array.isArray(params.offline)
      ? params.offline[0]
      : params.offline;
    if (!startRequested && !plotRequested && !offlineRequested) return;

    router.setParams({
      start: undefined,
      plot: undefined,
      offline: undefined,
    });

    if (offlineRequested) {
      setDownloadOpen(true);
      return;
    }
    if (plotRequested) {
      if (recording.isRecording) {
        Alert.alert(
          "Ride in progress",
          "Finish the current recording before building another route.",
        );
      } else {
        enterPlotMode();
      }
      return;
    }
    if (startRequested && !recording.isRecording) {
      if (!tracking) setTracking(true);
      recording.start().catch((error: unknown) => {
        Alert.alert(
          "Couldn't start recording",
          error instanceof Error ? error.message : "Unknown error",
        );
      });
    }
    // This effect intentionally responds only to one-shot route flags. Map
    // state changes must not replay a Home action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.start, params.plot, params.offline]);

  const savePlottedRoute = () => {
    if (plotPoints.length < 2) return;
    const now = Date.now();
    const points: TrackPoint[] = plotPoints.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      t: now + i,
      alt: plotElevations[i] ?? null,
      acc: null,
    }));
    const distanceMeters = pathLengthMeters(plotPoints);
    if (editTrackId) {
      // Editing an existing route: update in place rather than duplicating it.
      updateTrack(editTrackId, {
        name:
          plotName.trim() ||
          editingTrack?.name ||
          `Route ${new Date().toLocaleDateString()}`,
        description: plotDescription.trim() || null,
        points,
        distanceMeters,
        pointCount: points.length,
      });
    } else {
      const savedTrack = addTrack({
        name: plotName.trim() || `Route ${new Date().toLocaleDateString()}`,
        description: plotDescription.trim() || null,
        color: "#3a6ea5",
        kind: "plotted",
        points,
        distanceMeters,
        durationMs: 0,
        pointCount: points.length,
        startedAt: now,
        endedAt: now,
      });
      if (plotShareEnabled) {
        publishTrackAsCommunityDataset(savedTrack, waypoints, {
          author: plotShareAuthor.trim() || null,
        })
          .then((res) =>
            updateTrack(savedTrack.id, { publishedDatasetId: res.id }),
          )
          .catch(() => {});
      }
    }
    setSavePlotOpen(false);
    setPlotName("");
    setPlotDescription("");
    exitPlotMode();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
  };

  const handleLongPress = (lat: number, lng: number) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setPendingWaypoint({ lat, lng });
    setWaypointName("");
    setWaypointNotes("");
  };

  const confirmWaypoint = () => {
    if (!pendingWaypoint) return;
    const name = waypointName.trim() || undefined;
    const notes = waypointNotes.trim() || undefined;
    const createdWaypoint = addWaypoint(
      pendingWaypoint.lat,
      pendingWaypoint.lng,
      name,
      notes,
      {
        trackId: pendingWaypoint.trackId,
        photoUri: pendingWaypoint.photoUri,
      },
    );
    if (pendingWaypoint.trackId === recording.recordingTrackId) {
      recording.shareLiveWaypoint(createdWaypoint);
    }

    if (waypointPublish) {
      const displayName = name ?? `Waypoint ${new Date().toLocaleTimeString()}`;
      const snap = { ...pendingWaypoint };
      (async () => {
        let photoUrl: string | null = null;
        if (snap.photoUri && Platform.OS !== "web") {
          try {
            photoUrl = await uploadPhoto(snap.photoUri);
          } catch {
            // best-effort — publish without photo if upload fails
          }
        }
        await shareCommunityDataset({
          name: displayName,
          description: notes ?? null,
          format: "geojson",
          author: null,
          geojson: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {
                  _waypointMarker: true,
                  name: displayName,
                  notes: notes ?? null,
                  photoUrl,
                },
                geometry: {
                  type: "Point",
                  coordinates: [snap.lng, snap.lat],
                },
              },
            ],
          },
        });
      })().catch(() => {});
    }

    setPendingWaypoint(null);
    setWaypointPublish(false);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
  };

  const dropPoiAtCurrent = async (
    source: "none" | "camera" | "library",
  ): Promise<void> => {
    // Prefer the live GPS readout; fall back to the latest recording point.
    const last =
      recording.livePoints.length > 0
        ? recording.livePoints[recording.livePoints.length - 1]
        : null;
    const coords = me
      ? { lat: me.latitude, lng: me.longitude }
      : last
        ? { lat: last.lat, lng: last.lng }
        : null;
    if (!coords) {
      Alert.alert(
        "No location yet",
        "Waiting for a GPS fix before we can drop a POI here.",
      );
      return;
    }
    let photoUri: string | undefined;
    try {
      if (source === "camera") {
        photoUri = (await takePhoto()) ?? undefined;
        if (!photoUri) return; // user cancelled the camera
      } else if (source === "library") {
        photoUri = (await pickPhoto()) ?? undefined;
        if (!photoUri) return;
      }
    } catch (err) {
      Alert.alert(
        "Couldn't attach photo",
        err instanceof Error ? err.message : "Unknown error",
      );
      return;
    }
    const label = `POI ${new Date().toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
    // Open the waypoint sheet so the user can add an optional field note /
    // caption (e.g. "waterfall along the hike") before saving the POI.
    setWaypointName(label);
    setWaypointNotes("");
    setPendingWaypoint({
      lat: coords.lat,
      lng: coords.lng,
      photoUri,
      trackId: recording.recordingTrackId ?? undefined,
    });
  };

  const openPoiMenu = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    Alert.alert(
      "Drop POI here",
      "Add a waypoint at your current GPS position.",
      [
        { text: "Take photo", onPress: () => void dropPoiAtCurrent("camera") },
        {
          text: "Pick from library",
          onPress: () => void dropPoiAtCurrent("library"),
        },
        {
          text: "Add without photo",
          onPress: () => void dropPoiAtCurrent("none"),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const fitAllDatasets = () => {
    const bs = visibleDatasets.map((d) => d.bounds).filter(Boolean) as [
      number,
      number,
      number,
      number,
    ][];
    if (bs.length === 0) {
      Alert.alert(
        "No active datasets",
        "Import a dataset from the Library tab to get started.",
      );
      return;
    }
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity;
    bs.forEach(([w, s, e, n]) => {
      if (w < west) west = w;
      if (s < south) south = s;
      if (e > east) east = e;
      if (n > north) north = n;
    });
    mapRef.current?.fitBounds([west, south, east, north]);
  };

  const tilesPlanned = useMemo(() => {
    if (!view) return 0;
    const baseZoom = Math.floor(view.zoom);
    return tilesForBounds(
      view.bounds,
      Math.max(0, baseZoom),
      Math.min(18, baseZoom + downloadZoom),
    ).length;
  }, [view, downloadZoom]);

  const layerIdsToDownload = useMemo<string[]>(
    () => [layers.base, ...layers.overlays],
    [layers.base, layers.overlays],
  );

  const totalDownloadJobs = useMemo(() => {
    if (!view) return 0;
    const baseZoom = Math.floor(view.zoom);
    const minZ = Math.max(0, baseZoom);
    const maxZ = Math.min(18, baseZoom + downloadZoom);
    let count = 0;
    for (const id of layerIdsToDownload) {
      const cap = ALL_LAYERS[id]?.maxZoom ?? 18;
      const effectiveMax = Math.min(maxZ, cap);
      if (effectiveMax < minZ) continue;
      const layerTiles = tilesForBounds(view.bounds, minZ, effectiveMax);
      count += layerTiles.length;
    }
    return count;
  }, [view, downloadZoom, layerIdsToDownload]);

  const startDownload = async () => {
    if (!view) return;
    if (totalDownloadJobs > 1600) {
      Alert.alert(
        "Area too large",
        `That selection would download ${totalDownloadJobs} tiles across ${layerIdsToDownload.length} layer(s). Zoom in, reduce the detail level, or turn off some overlays.`,
      );
      return;
    }
    const baseZoom = Math.floor(view.zoom);
    const tiles = tilesForBounds(
      view.bounds,
      Math.max(0, baseZoom),
      Math.min(18, baseZoom + downloadZoom),
    );
    setDownloadProgress({
      total: totalDownloadJobs,
      done: 0,
      failed: 0,
    });
    const result = await downloadTilesForLayers(
      tiles,
      layerIdsToDownload,
      (p) => setDownloadProgress(p),
    );
    const manifest = await buildOfflineManifest();
    setOfflineManifest(manifest);
    mapRef.current?.setOfflineTiles(manifest);
    const stats = await tileCacheSize();
    setCacheStats(stats);
    addRegion({
      name: downloadName.trim() || `Region ${new Date().toLocaleDateString()}`,
      bounds: view.bounds,
      minZoom: Math.max(0, baseZoom),
      maxZoom: Math.min(18, baseZoom + downloadZoom),
      tileCount: result.done,
    });
    setDownloadProgress(null);
    setDownloadOpen(false);
    setDownloadName("");
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <MapViewComponent
        ref={mapRef}
        datasets={datasets}
        waypoints={waypoints}
        tracks={tracks}
        liveTrack={recording.livePoints}
        liveFollowedRoute={recording.liveActivity?.followedRoute}
        offlineManifest={offlineManifest}
        onlineEnabled={onlineEnabled}
        baseLayer={layers.base}
        overlays={layers.overlays}
        plotMode={plotMode}
        plotPoints={plotPoints}
        plotSelectedIndex={selectedPlotIndex}
        onPlotTap={handlePlotTap}
        onPlotMove={handlePlotMove}
        onPlotInsert={handlePlotInsert}
        onPlotVertexTap={handlePlotVertexTap}
        onLongPress={handleLongPress}
        onDatasetTap={handleDatasetTap}
        onTrackTap={handleTrackTap}
        onView={setView}
      />

      {/* Top bar */}
      <View
        style={[
          styles.topBar,
          {
            top: insets.top + WEB_TOP_INSET + 8,
            left: 16,
            right: 16,
          },
        ]}
      >
        <View
          style={[
            styles.topPill,
            { backgroundColor: colors.background, shadowColor: "#000" },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: onlineEnabled ? colors.primary : colors.accent,
              },
            ]}
          />
          <Text style={[styles.topPillText, { color: colors.foreground }]}>
            {onlineEnabled ? "Online" : "Offline"}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.topPillSub, { color: colors.mutedForeground }]}>
            {visibleDatasets.length}{" "}
            {visibleDatasets.length === 1 ? "dataset" : "datasets"}
          </Text>
        </View>
      </View>

      {/* Right controls */}
      <View
        style={[
          styles.rightControls,
          {
            top: insets.top + WEB_TOP_INSET + 64,
            right: 16,
          },
        ]}
      >
        <MapControl onPress={() => setOnlineEnabled((v) => !v)}>
          <Feather
            name={onlineEnabled ? "wifi" : "wifi-off"}
            size={20}
            color={colors.foreground}
          />
        </MapControl>
        <MapControl onPress={() => setLayersOpen(true)}>
          <Feather name="layers" size={20} color={colors.foreground} />
        </MapControl>
        <MapControl onPress={fitAllDatasets}>
          <Feather name="maximize-2" size={20} color={colors.foreground} />
        </MapControl>
        <MapControl onPress={() => setDownloadOpen(true)}>
          <Feather name="download" size={20} color={colors.foreground} />
        </MapControl>
        {(recording.isRecording || recording.liveActivity) && (
          <MapControl onPress={() => void openLiveShare()}>
            <Feather
              name="radio"
              size={20}
              color={
                recording.liveActivity?.status === "active"
                  ? colors.accent
                  : colors.foreground
              }
            />
          </MapControl>
        )}
        {!recording.isRecording && !followTrack && (
          <MapControl
            onPress={() => (plotMode ? exitPlotMode() : enterPlotMode())}
          >
            <Feather
              name="share-2"
              size={20}
              color={plotMode ? colors.primary : colors.foreground}
            />
          </MapControl>
        )}
      </View>

      {/* Bottom GPS button */}
      {!plotMode && !followTrack && (
        <View
          style={[
            styles.bottomActions,
            {
              bottom:
                insets.bottom +
                WEB_BOTTOM_INSET +
                (Platform.OS === "ios" ? 96 : 84),
              right: 16,
            },
          ]}
        >
          <Pressable
            onPress={async () => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => {});
              }
              if (recording.isRecording) {
                const t = await recording.stop();
                if (t) {
                  setPostSaveTrack(t);
                  setPostSaveShareEnabled(false);
                  setPostSaveAuthor("");
                } else {
                  Alert.alert(
                    "Track too short",
                    "Need at least two GPS points to save a track.",
                  );
                }
              } else {
                try {
                  if (!tracking) setTracking(true);
                  await recording.start();
                } catch (err) {
                  Alert.alert(
                    "Couldn't start recording",
                    err instanceof Error ? err.message : "Unknown error",
                  );
                }
              }
            }}
            style={({ pressed }) => [
              styles.gpsBtn,
              {
                backgroundColor: recording.isRecording
                  ? colors.destructive
                  : colors.background,
                opacity: pressed ? 0.85 : 1,
                marginBottom: 10,
              },
            ]}
          >
            <Feather
              name={recording.isRecording ? "square" : "circle"}
              size={22}
              color={
                recording.isRecording
                  ? colors.primaryForeground
                  : colors.destructive
              }
            />
          </Pressable>
          {recording.isRecording && (
            <Pressable
              onPress={openPoiMenu}
              style={({ pressed }) => [
                styles.gpsBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                  marginBottom: 10,
                },
              ]}
            >
              <Feather
                name="map-pin"
                size={22}
                color={colors.primaryForeground}
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setTracking((v) => !v);
              if (Platform.OS !== "web") {
                Haptics.selectionAsync().catch(() => {});
              }
            }}
            style={({ pressed }) => [
              styles.gpsBtn,
              {
                backgroundColor: tracking ? colors.primary : colors.background,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather
              name={tracking ? "navigation" : "crosshair"}
              size={22}
              color={tracking ? colors.primaryForeground : colors.foreground}
            />
          </Pressable>
        </View>
      )}

      {recording.isRecording &&
        !plotMode &&
        (activeLiveActivity && !livePanelExpanded ? (
          <Pressable
            accessibilityLabel={
              unreadViewerMessageCount
                ? `Open live sharing controls, ${unreadViewerMessageCount} new message${unreadViewerMessageCount === 1 ? "" : "s"}`
                : "Open live sharing controls"
            }
            onPress={() => setLivePanelExpanded(true)}
            style={({ pressed }) => [
              styles.livePanelCompact,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                bottom:
                  insets.bottom +
                  WEB_BOTTOM_INSET +
                  (Platform.OS === "ios" ? 96 : 84) +
                  (followTrack ? 260 : 0),
                left: 16,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Feather name="radio" size={18} color={colors.primary} />
            {unreadViewerMessageCount > 0 && (
              <View
                style={[
                  styles.liveUnreadBadge,
                  { backgroundColor: colors.destructive },
                ]}
              >
                <Text
                  style={[
                    styles.liveUnreadBadgeText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {unreadViewerMessageCount > 9
                    ? "9+"
                    : unreadViewerMessageCount}
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          <View
            style={[
              styles.livePanel,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                bottom:
                  insets.bottom +
                  WEB_BOTTOM_INSET +
                  (Platform.OS === "ios" ? 96 : 84) +
                  (followTrack ? 260 : 0),
                left: 16,
                right: 92,
              },
            ]}
          >
            {recording.liveActivity?.status === "active" ? (
              <>
                <View style={styles.livePanelHeader}>
                  <Feather name="radio" size={16} color={colors.primary} />
                  <Text
                    style={[
                      styles.livePanelTitle,
                      { color: colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    Sharing live: {recording.liveActivity.name}
                  </Text>
                  {unreadViewerMessageCount > 0 && (
                    <View
                      style={[
                        styles.liveUnreadBadge,
                        { backgroundColor: colors.destructive },
                      ]}
                    >
                      <Text
                        style={[
                          styles.liveUnreadBadgeText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        {unreadViewerMessageCount > 9
                          ? "9+"
                          : unreadViewerMessageCount}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    accessibilityLabel="Minimize live sharing controls"
                    hitSlop={8}
                    onPress={() => setLivePanelExpanded(false)}
                  >
                    <Feather
                      name="chevron-down"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>
                <Text
                  style={[
                    styles.modePanelHint,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {liveSyncHint}
                </Text>
                {queuedLiveUpdateCount > 0 &&
                  liveSyncState !== "up-to-date" && (
                    <Pressable
                      onPress={() => void recording.refreshLiveShare()}
                      style={({ pressed }) => [
                        styles.liveRetryAction,
                        {
                          borderColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Feather
                        name="refresh-cw"
                        size={13}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.liveRetryActionText,
                          { color: colors.foreground },
                        ]}
                      >
                        Retry live sync
                      </Text>
                    </Pressable>
                  )}
                <Pressable
                  onPress={() => void copyLiveLink()}
                  disabled={!recording.liveActivity.url}
                  style={({ pressed }) => [
                    styles.liveLinkAction,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      opacity: !recording.liveActivity?.url
                        ? 0.48
                        : pressed
                          ? 0.72
                          : 1,
                    },
                  ]}
                >
                  <Feather name="copy" size={14} color={colors.primary} />
                  <Text
                    style={[
                      styles.liveLinkActionText,
                      { color: colors.foreground },
                    ]}
                  >
                    {recording.liveActivity.url
                      ? "Copy private link"
                      : "Refreshing private link…"}
                  </Text>
                </Pressable>
                {recording.liveActivity.messages
                  .filter((message) => message.sender === "viewer")
                  .slice(-1)
                  .map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.liveMessage,
                        {
                          backgroundColor: colors.secondary,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="message-circle"
                        size={14}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.liveMessageText,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={2}
                      >
                        {message.displayName || "Viewer"}: {message.body}
                      </Text>
                    </View>
                  ))}
                <View style={styles.liveQuickReplies}>
                  {["All good", "On my way", "Almost done"].map((reply) => (
                    <Pressable
                      key={reply}
                      onPress={() => void recording.sendLiveReply(reply)}
                      style={({ pressed }) => [
                        styles.liveQuickReply,
                        {
                          borderColor: colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.liveQuickReplyText,
                          { color: colors.foreground },
                        ]}
                      >
                        {reply}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.liveReplyRow}>
                  <TextInput
                    value={liveReply}
                    onChangeText={setLiveReply}
                    placeholder="Reply"
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={280}
                    style={[
                      styles.liveReplyInput,
                      {
                        borderColor: colors.border,
                        color: colors.foreground,
                        backgroundColor: colors.card,
                      },
                    ]}
                  />
                  <Pressable
                    onPress={() => {
                      void recording.sendLiveReply(liveReply);
                      setLiveReply("");
                    }}
                    disabled={!liveReply.trim()}
                    style={({ pressed }) => [
                      styles.liveSend,
                      {
                        backgroundColor: colors.primary,
                        opacity: !liveReply.trim() ? 0.45 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name="send"
                      size={15}
                      color={colors.primaryForeground}
                    />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Stop live sharing?",
                      "This immediately invalidates the private link. Your local recording will continue.",
                      [
                        { text: "Keep sharing", style: "cancel" },
                        {
                          text: "Stop sharing",
                          style: "destructive",
                          onPress: () => void recording.revokeLiveShare(),
                        },
                      ],
                    )
                  }
                >
                  <Text
                    style={[styles.liveStopText, { color: colors.destructive }]}
                  >
                    Stop sharing and invalidate link
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.livePanelHeader}>
                  <Feather name="send" size={16} color={colors.primary} />
                  <Text
                    style={[
                      styles.livePanelTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    Share this live activity
                  </Text>
                </View>
                <Text
                  style={[
                    styles.modePanelHint,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Create a private link to your current route. Copy it into your
                  preferred SMS or messaging app.
                </Text>
                <Pressable
                  onPress={() => void openLiveShare()}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="link"
                    size={16}
                    color={colors.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Create private live link
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ))}

      <Sheet
        visible={liveShareOpen}
        onClose={() => setLiveShareOpen(false)}
        title="Create private live link"
      >
        <View style={styles.liveShareSheet}>
          <Text style={[styles.liveNotice, { color: colors.mutedForeground }]}>
            The link shows your route and last-known location while recording.
            Location updates may pause outside coverage; you can invalidate the
            link at any time.
          </Text>
          <Text style={[styles.label, { color: colors.foreground }]}>
            Activity name
          </Text>
          <TextInput
            value={liveShareName}
            onChangeText={setLiveShareName}
            maxLength={120}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.foreground },
            ]}
          />
          <Text style={[styles.label, { color: colors.foreground }]}>
            Your display name
          </Text>
          <TextInput
            value={liveShareOwnerName}
            onChangeText={setLiveShareOwnerName}
            placeholder="Sam"
            placeholderTextColor={colors.mutedForeground}
            maxLength={80}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.foreground },
            ]}
          />
          {followTrack ? (
            <Text
              style={[styles.liveNotice, { color: colors.mutedForeground }]}
            >
              Viewers will also see the followed trail: {followTrack.name}.
            </Text>
          ) : null}
          <Pressable
            disabled={liveShareSending}
            onPress={() => void createAndCopyLiveLink()}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: liveShareSending ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name="copy" size={17} color={colors.primaryForeground} />
            <Text
              style={[
                styles.primaryBtnText,
                { color: colors.primaryForeground },
              ]}
            >
              {liveShareSending
                ? "Creating private link…"
                : "Create and copy private link"}
            </Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Route plotting panel */}
      {plotMode && (
        <View
          style={[
            styles.modePanel,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              bottom:
                insets.bottom +
                WEB_BOTTOM_INSET +
                (Platform.OS === "ios" ? 96 : 84),
              left: 16,
              right: 16,
            },
          ]}
        >
          <View style={styles.modePanelHeader}>
            <Feather name="share-2" size={16} color={colors.primary} />
            <Text style={[styles.modePanelTitle, { color: colors.foreground }]}>
              {editTrackId ? "Edit route" : "Plot a route"}
            </Text>
            <Text
              style={[styles.modePanelHint, { color: colors.mutedForeground }]}
            >
              Tap to add · drag to move · + to insert
            </Text>
          </View>
          <View style={styles.modeStatsRow}>
            <View style={styles.modeStat}>
              <Text
                style={[styles.coordsLabel, { color: colors.mutedForeground }]}
              >
                Distance
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {formatDistance(plotDistanceMeters, settings.units)}
              </Text>
            </View>
            <View style={styles.modeStat}>
              <Text
                style={[styles.coordsLabel, { color: colors.mutedForeground }]}
              >
                Points
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {plotPoints.length}
              </Text>
            </View>
            <View style={styles.modeStat}>
              <Text
                style={[styles.coordsLabel, { color: colors.mutedForeground }]}
              >
                Elev. gain
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {!onlineEnabled
                  ? "—"
                  : plotElevLoading
                    ? "…"
                    : plotElevations.length > 0
                      ? `↑ ${formatElevation(plotElevGain, settings.units)}`
                      : "—"}
              </Text>
            </View>
            <View style={styles.modeStat}>
              <Text
                style={[styles.coordsLabel, { color: colors.mutedForeground }]}
              >
                Elev. loss
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {!onlineEnabled
                  ? "—"
                  : plotElevLoading
                    ? "…"
                    : plotElevations.length > 0
                      ? `↓ ${formatElevation(plotElevLoss, settings.units)}`
                      : "—"}
              </Text>
            </View>
          </View>
          {onlineEnabled && plotProfilePoints.length >= 2 && (
            <View style={{ marginTop: 8 }}>
              <ElevationProfile
                points={plotProfilePoints}
                onScrub={(p) =>
                  mapRef.current?.setElevationMarker(
                    p ? { lat: p.lat, lng: p.lng } : null,
                  )
                }
              />
            </View>
          )}
          {!onlineEnabled && (
            <Text
              style={[styles.modePanelHint, { color: colors.mutedForeground }]}
            >
              Elevation needs a connection — turn Online on to fetch it.
            </Text>
          )}
          {selectedPlotIndex !== null && (
            <View
              style={[
                styles.selectedBar,
                { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.modeBtnText, { color: colors.foreground }]}
                numberOfLines={1}
              >
                Point {selectedPlotIndex + 1} selected
              </Text>
              <View style={styles.selectedBarBtns}>
                <Pressable
                  onPress={deleteSelectedPlotPoint}
                  style={({ pressed }) => [
                    styles.selectedBtn,
                    {
                      backgroundColor: colors.destructive,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="trash-2"
                    size={14}
                    color={colors.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Delete point
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedPlotIndex(null)}
                  style={({ pressed }) => [
                    styles.selectedBtn,
                    {
                      borderColor: colors.border,
                      borderWidth: 1,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.modeBtnText, { color: colors.foreground }]}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          <View style={styles.modeBtnRow}>
            <Pressable
              onPress={undoPlotEdit}
              disabled={!canUndo}
              style={({ pressed }) => [
                styles.modeBtn,
                {
                  borderColor: colors.border,
                  opacity: !canUndo ? 0.4 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather
                name="corner-up-left"
                size={16}
                color={colors.foreground}
              />
              <Text style={[styles.modeBtnText, { color: colors.foreground }]}>
                Undo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                pushPlotHistory(plotPoints);
                setPlotPoints([]);
                setSelectedPlotIndex(null);
              }}
              disabled={plotPoints.length === 0}
              style={({ pressed }) => [
                styles.modeBtn,
                {
                  borderColor: colors.border,
                  opacity: plotPoints.length === 0 ? 0.4 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name="trash-2" size={16} color={colors.foreground} />
              <Text style={[styles.modeBtnText, { color: colors.foreground }]}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              onPress={exitPlotMode}
              style={({ pressed }) => [
                styles.modeBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[styles.modeBtnText, { color: colors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!editTrackId) setPlotName("");
                setPlotShareEnabled(false);
                setPlotShareAuthor("");
                setSavePlotOpen(true);
              }}
              disabled={plotPoints.length < 2}
              style={({ pressed }) => [
                styles.modeBtn,
                styles.modeBtnPrimary,
                {
                  backgroundColor: colors.primary,
                  opacity: plotPoints.length < 2 ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather
                name="check"
                size={16}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Route following panel */}
      {followTrack && (
        <View
          style={[
            styles.modePanel,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              bottom:
                insets.bottom +
                WEB_BOTTOM_INSET +
                (Platform.OS === "ios" ? 96 : 84),
              left: 16,
              right: 16,
            },
          ]}
        >
          <View style={styles.modePanelHeader}>
            <Feather name="navigation" size={16} color={colors.primary} />
            <Text
              style={[styles.modePanelTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {followTrack.name}
            </Text>
          </View>
          {followProgress ? (
            <>
              <View style={styles.modeStatsRow}>
                <View style={styles.modeStat}>
                  <Text
                    style={[
                      styles.coordsLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Remaining
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {formatDistance(
                      followProgress.distanceRemainingMeters,
                      settings.units,
                    )}
                  </Text>
                </View>
                <View style={styles.modeStat}>
                  <Text
                    style={[
                      styles.coordsLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Off route
                  </Text>
                  <Text
                    style={[
                      styles.coordsValue,
                      {
                        color:
                          followProgress.offRouteMeters >
                          settings.offRouteThreshold
                            ? colors.destructive
                            : colors.foreground,
                      },
                    ]}
                  >
                    {formatDistance(
                      followProgress.offRouteMeters,
                      settings.units,
                    )}
                  </Text>
                </View>
                <View style={styles.modeStat}>
                  <Text
                    style={[
                      styles.coordsLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Climb left
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {followClimbRemaining?.hasData
                      ? `↑ ${formatElevation(
                          followClimbRemaining.gainMeters,
                          settings.units,
                        )}`
                      : "—"}
                  </Text>
                </View>
                <View style={styles.modeStat}>
                  <Text
                    style={[
                      styles.coordsLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Next summit
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {followNextPeakDist != null
                      ? formatDistance(followNextPeakDist, settings.units)
                      : "—"}
                  </Text>
                </View>
              </View>
              {followProgress.offRouteMeters > settings.offRouteThreshold && (
                <View
                  style={[
                    styles.offRouteBanner,
                    { backgroundColor: colors.destructive },
                  ]}
                >
                  <Feather
                    name="alert-triangle"
                    size={14}
                    color={colors.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Off route — head back toward the line
                  </Text>
                </View>
              )}
              <View style={{ gap: 6 }}>
                <Text
                  style={[
                    styles.coordsLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Elevation ahead
                </Text>
                <ElevationProfile
                  points={followTrack.points}
                  height={72}
                  markerDist={followMarkerDist}
                  highlightRange={
                    followNextClimb
                      ? {
                          startDist: followNextClimb.startDist,
                          endDist: followNextClimb.endDist,
                        }
                      : null
                  }
                />
              </View>
            </>
          ) : (
            <Text
              style={[styles.modePanelHint, { color: colors.mutedForeground }]}
            >
              {tracking
                ? "Waiting for your GPS position…"
                : "Turn on position tracking to follow."}
            </Text>
          )}
          <View style={{ gap: 6 }}>
            <Text
              style={[styles.coordsLabel, { color: colors.mutedForeground }]}
            >
              Off-route distance
            </Text>
            <View style={styles.modeBtnRow}>
              {offRouteThresholdPresets(settings.units).map((preset) => {
                const selected = settings.offRouteThreshold === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => {
                      updateSettings({ offRouteThreshold: preset });
                      if (Platform.OS !== "web") {
                        Haptics.selectionAsync().catch(() => {});
                      }
                    }}
                    style={({ pressed }) => [
                      styles.modeBtn,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected
                          ? colors.primary
                          : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {formatDistance(preset, settings.units)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.modeBtnRow}>
            <Pressable
              onPress={() => {
                updateSettings({ offRouteAlerts: !settings.offRouteAlerts });
                if (Platform.OS !== "web") {
                  Haptics.selectionAsync().catch(() => {});
                }
              }}
              style={({ pressed }) => [
                styles.modeBtn,
                {
                  borderColor: settings.offRouteAlerts
                    ? colors.primary
                    : colors.border,
                  backgroundColor: settings.offRouteAlerts
                    ? colors.primary
                    : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather
                name={settings.offRouteAlerts ? "bell" : "bell-off"}
                size={16}
                color={
                  settings.offRouteAlerts
                    ? colors.primaryForeground
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  styles.modeBtnText,
                  {
                    color: settings.offRouteAlerts
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                Alerts
              </Text>
            </Pressable>
            <Pressable
              disabled={!settings.offRouteAlerts}
              onPress={() => {
                updateSettings({ offRouteVoice: !settings.offRouteVoice });
                if (Platform.OS !== "web") {
                  Haptics.selectionAsync().catch(() => {});
                }
              }}
              style={({ pressed }) => {
                const active =
                  settings.offRouteVoice && settings.offRouteAlerts;
                return [
                  styles.modeBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : "transparent",
                    opacity: !settings.offRouteAlerts ? 0.4 : pressed ? 0.7 : 1,
                  },
                ];
              }}
            >
              <Feather
                name={settings.offRouteVoice ? "volume-2" : "volume-x"}
                size={16}
                color={
                  settings.offRouteVoice && settings.offRouteAlerts
                    ? colors.primaryForeground
                    : colors.mutedForeground
                }
              />
              <Text
                style={[
                  styles.modeBtnText,
                  {
                    color:
                      settings.offRouteVoice && settings.offRouteAlerts
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}
              >
                Voice
              </Text>
            </Pressable>
          </View>
          {bgFollowActive && (
            <View
              style={[
                styles.bgFollowBar,
                { backgroundColor: colors.muted, borderColor: colors.border },
              ]}
            >
              <Feather name="shield" size={14} color={colors.primary} />
              <Text
                style={[styles.bgFollowText, { color: colors.foreground }]}
                numberOfLines={2}
              >
                Background alerts on — keeps buzzing with your screen locked.
              </Text>
            </View>
          )}
          <View style={styles.modeBtnRow}>
            <Pressable
              onPress={() => {
                setTracking((v) => !v);
                if (Platform.OS !== "web") {
                  Haptics.selectionAsync().catch(() => {});
                }
              }}
              style={({ pressed }) => [
                styles.modeBtn,
                tracking ? styles.modeBtnPrimary : null,
                {
                  borderColor: colors.border,
                  backgroundColor: tracking ? colors.primary : "transparent",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather
                name={tracking ? "navigation" : "crosshair"}
                size={16}
                color={tracking ? colors.primaryForeground : colors.foreground}
              />
              <Text
                style={[
                  styles.modeBtnText,
                  {
                    color: tracking
                      ? colors.primaryForeground
                      : colors.foreground,
                  },
                ]}
              >
                {tracking ? "GPS on" : "Enable GPS"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFollowTrack(null)}
              style={({ pressed }) => [
                styles.modeBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="x" size={16} color={colors.foreground} />
              <Text style={[styles.modeBtnText, { color: colors.foreground }]}>
                Stop following
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {recording.isRecording && (
        <View
          style={[
            styles.recordPill,
            {
              backgroundColor: colors.destructive,
              top: insets.top + WEB_TOP_INSET + 8,
            },
          ]}
        >
          <View style={styles.recordDot} />
          <Text
            style={[styles.recordText, { color: colors.primaryForeground }]}
          >
            REC · {formatDistance(recording.liveDistanceMeters, settings.units)}{" "}
            · {formatDuration(recording.liveDurationMs)}
          </Text>
        </View>
      )}

      {/* Coords readout */}
      {me && !plotMode && !followTrack && !recording.isRecording && (
        <View
          style={[
            styles.coords,
            {
              backgroundColor: colors.background,
              bottom:
                insets.bottom +
                WEB_BOTTOM_INSET +
                (Platform.OS === "ios" ? 96 : 84),
              left: 16,
            },
          ]}
        >
          <Text style={[styles.coordsLabel, { color: colors.mutedForeground }]}>
            Position
          </Text>
          <Text style={[styles.coordsValue, { color: colors.foreground }]}>
            {me.latitude.toFixed(5)}°, {me.longitude.toFixed(5)}°
          </Text>
          {me.accuracy ? (
            <Text
              style={[styles.coordsLabel, { color: colors.mutedForeground }]}
            >
              ±{Math.round(me.accuracy)}m
            </Text>
          ) : null}
        </View>
      )}

      {/* Save plotted route sheet */}
      <Sheet
        visible={savePlotOpen}
        onClose={() => setSavePlotOpen(false)}
        title={editTrackId ? "Update route" : "Save route"}
      >
        <View style={{ gap: 14 }}>
          <View style={styles.summaryRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Distance
            </Text>
            <Text style={[styles.coordsValue, { color: colors.foreground }]}>
              {formatDistance(plotDistanceMeters, settings.units)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Elevation gain
            </Text>
            <Text style={[styles.coordsValue, { color: colors.foreground }]}>
              {plotElevations.length > 0
                ? formatElevation(plotElevGain, settings.units)
                : "—"}
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Elevation profile
            </Text>
            <ElevationProfile
              points={plotProfilePoints}
              onScrub={(p) =>
                mapRef.current?.setElevationMarker(
                  p ? { lat: p.lat, lng: p.lng } : null,
                )
              }
            />
          </View>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Route name
          </Text>
          <TextInput
            value={plotName}
            onChangeText={setPlotName}
            placeholder="Summit loop, river crossing…"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
              },
            ]}
          />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Description
          </Text>
          <TextInput
            value={plotDescription}
            onChangeText={setPlotDescription}
            placeholder="Notes, conditions, what to expect…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.card,
                minHeight: 72,
                textAlignVertical: "top",
              },
            ]}
          />
          {/* Community publish toggle (only for new routes, not edits) */}
          {!editTrackId && (
            <>
              <View style={[styles.summaryRow, { paddingVertical: 4 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Share to community
                </Text>
                <Switch
                  value={plotShareEnabled}
                  onValueChange={setPlotShareEnabled}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
              {plotShareEnabled && (
                <>
                  <Text
                    style={[styles.label, { color: colors.mutedForeground }]}
                  >
                    Your name (optional)
                  </Text>
                  <TextInput
                    value={plotShareAuthor}
                    onChangeText={setPlotShareAuthor}
                    placeholder="Anonymous"
                    placeholderTextColor={colors.mutedForeground}
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.foreground,
                        backgroundColor: colors.card,
                      },
                    ]}
                  />
                </>
              )}
            </>
          )}
          <Pressable
            onPress={savePlottedRoute}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="check" size={18} color={colors.primaryForeground} />
            <Text
              style={[
                styles.primaryBtnText,
                { color: colors.primaryForeground },
              ]}
            >
              {editTrackId
                ? "Update route"
                : plotShareEnabled
                  ? "Save & share"
                  : "Save route"}
            </Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Post-recording publish sheet */}
      <Sheet
        visible={!!postSaveTrack}
        onClose={() => {
          if (!postSavePublishing) setPostSaveTrack(null);
        }}
        title="Track saved!"
      >
        {postSaveTrack && (
          <View style={{ gap: 14 }}>
            <Text
              style={[styles.label, { color: colors.foreground, fontSize: 15 }]}
              numberOfLines={2}
            >
              {postSaveTrack.name}
            </Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Distance
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {formatDistance(postSaveTrack.distanceMeters, settings.units)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Duration
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {formatDuration(postSaveTrack.durationMs)}
              </Text>
            </View>
            {waypoints.filter(
              (w) => w.trackId === postSaveTrack.id && w.photoUri,
            ).length > 0 && (
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                {
                  waypoints.filter(
                    (w) => w.trackId === postSaveTrack.id && w.photoUri,
                  ).length
                }{" "}
                POI photo
                {waypoints.filter(
                  (w) => w.trackId === postSaveTrack.id && w.photoUri,
                ).length !== 1
                  ? "s"
                  : ""}{" "}
                will upload
              </Text>
            )}
            <View style={[styles.summaryRow, { paddingVertical: 4 }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Publish to community
              </Text>
              <Switch
                value={postSaveShareEnabled}
                onValueChange={setPostSaveShareEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            {postSaveShareEnabled && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Your name (optional)
                </Text>
                <TextInput
                  value={postSaveAuthor}
                  onChangeText={setPostSaveAuthor}
                  placeholder="Anonymous"
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                    },
                  ]}
                />
              </>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setPostSaveTrack(null)}
                disabled={postSavePublishing}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    flex: 1,
                    backgroundColor: colors.secondary,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.primaryBtnText, { color: colors.foreground }]}
                >
                  Close
                </Text>
              </Pressable>
              {postSaveShareEnabled && (
                <Pressable
                  onPress={async () => {
                    if (!postSaveTrack || postSavePublishing) return;
                    setPostSavePublishing(true);
                    try {
                      const res = await publishTrackAsCommunityDataset(
                        postSaveTrack,
                        waypoints,
                        { author: postSaveAuthor.trim() || null },
                      );
                      updateTrack(postSaveTrack.id, {
                        publishedDatasetId: res.id,
                      });
                      if (Platform.OS !== "web") {
                        Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success,
                        ).catch(() => {});
                      }
                      setPostSaveTrack(null);
                      Alert.alert(
                        "Published!",
                        `"${postSaveTrack.name}" is now in the community library.`,
                      );
                    } catch (err) {
                      Alert.alert(
                        "Publish failed",
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setPostSavePublishing(false);
                    }
                  }}
                  disabled={postSavePublishing}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    {
                      flex: 1,
                      backgroundColor: colors.primary,
                      opacity: postSavePublishing ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {postSavePublishing ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primaryForeground}
                    />
                  ) : (
                    <Feather
                      name="upload-cloud"
                      size={18}
                      color={colors.primaryForeground}
                    />
                  )}
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {postSavePublishing ? "Publishing…" : "Publish"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </Sheet>

      {/* Dataset (community route) detail sheet */}
      <Sheet
        visible={!!datasetDetail}
        onClose={() => setDatasetDetail(null)}
        title={datasetDetail?.dataset.name ?? "Route"}
      >
        {datasetDetail && (
          <View style={{ gap: 14 }}>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Distance
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {datasetDetail.points.length >= 2
                  ? formatDistance(datasetDistanceMeters, settings.units)
                  : "—"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Elevation gain
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {datasetElevLoading
                  ? "Loading…"
                  : datasetHasElevation
                    ? formatElevation(
                        datasetElevStats.gainMeters,
                        settings.units,
                      )
                    : "—"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Elevation loss
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {datasetElevLoading
                  ? "Loading…"
                  : datasetHasElevation
                    ? formatElevation(
                        datasetElevStats.lossMeters,
                        settings.units,
                      )
                    : "—"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Points
              </Text>
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {datasetDetail.points.length}
              </Text>
            </View>
            {datasetHasElevation && datasetDetail.points.length >= 2 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Elevation profile
                </Text>
                <ElevationProfile
                  points={datasetDetail.points}
                  onScrub={(p) =>
                    mapRef.current?.setElevationMarker(
                      p ? { lat: p.lat, lng: p.lng } : null,
                    )
                  }
                />
              </View>
            )}
            {datasetWaypoints.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>
                  Waypoints ({datasetWaypoints.length})
                </Text>
                {datasetWaypoints.map((f, i) => {
                  const props = f.properties ?? {};
                  const name =
                    (props["name"] as string | undefined) || "Waypoint";
                  const notes = props["notes"] as string | undefined;
                  const photoUrl = props["photoUrl"] as string | undefined;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waypointRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.muted,
                        },
                      ]}
                    >
                      {photoUrl ? (
                        <Image
                          source={{ uri: photoUrl }}
                          style={styles.waypointThumb}
                        />
                      ) : (
                        <View
                          style={[
                            styles.waypointThumb,
                            {
                              backgroundColor: colors.border,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Feather
                            name="map-pin"
                            size={18}
                            color={colors.mutedForeground}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.coordsValue,
                            { color: colors.foreground, fontSize: 13 },
                          ]}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        {notes ? (
                          <Text
                            style={[
                              styles.label,
                              {
                                color: colors.mutedForeground,
                                fontSize: 12,
                                marginTop: 2,
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {notes}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {datasetDetail.points.length >= 2 ? (
              <Pressable
                onPress={followDataset}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
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
                    styles.primaryBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Follow this route
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                This dataset has no route line to follow.
              </Text>
            )}
          </View>
        )}
      </Sheet>

      {/* Track-tap swipeable picker — shown when user taps overlapping tracks */}
      <Sheet
        visible={!!trackTapSheet}
        onClose={() => {
          setTrackTapSheet(null);
          mapRef.current?.highlightTrack(null);
        }}
        title={
          trackTapSheet && trackTapSheet.length > 1
            ? `${trackTapSheet.length} tracks here`
            : (trackTapSheet?.[0]?.name ?? "Track")
        }
      >
        {trackTapSheet && (
          <View style={{ gap: 12 }}>
            {trackTapSheet.length > 1 && (
              <Text
                style={[
                  styles.label,
                  { color: colors.mutedForeground, textAlign: "center" },
                ]}
              >
                Swipe to browse · tap Follow to navigate
              </Text>
            )}
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={Dimensions.get("window").width - 48}
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => {
                const cardWidth = Dimensions.get("window").width - 48;
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / cardWidth,
                );
                const t = trackTapSheet[idx];
                if (t) mapRef.current?.highlightTrack(t.id);
              }}
            >
              {trackTapSheet.map((t, idx) => {
                const distM =
                  t.points.length >= 2 ? pathLengthMeters(t.points) : null;
                const dur = t.durationMs > 0 ? t.durationMs : null;
                const cardWidth = Dimensions.get("window").width - 48;
                return (
                  <View
                    key={t.id}
                    style={[
                      styles.trackPickerCard,
                      {
                        width: cardWidth,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        marginRight: idx < trackTapSheet.length - 1 ? 8 : 0,
                      },
                    ]}
                  >
                    <View style={styles.trackPickerHeader}>
                      <Text
                        style={[
                          styles.trackPickerName,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {t.name || "Untitled track"}
                      </Text>
                      <View
                        style={[
                          styles.trackKindBadge,
                          {
                            backgroundColor:
                              t.kind === "plotted"
                                ? colors.primary + "22"
                                : colors.accent + "22",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.trackKindText,
                            {
                              color:
                                t.kind === "plotted"
                                  ? colors.primary
                                  : colors.accent,
                            },
                          ]}
                        >
                          {t.kind === "plotted" ? "plotted" : "recorded"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.trackPickerStats}>
                      {distM !== null && (
                        <View style={styles.trackPickerStat}>
                          <Feather
                            name="map-pin"
                            size={13}
                            color={colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.trackPickerStatText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {formatDistance(distM, settings.units)}
                          </Text>
                        </View>
                      )}
                      {dur !== null && (
                        <View style={styles.trackPickerStat}>
                          <Feather
                            name="clock"
                            size={13}
                            color={colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.trackPickerStatText,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {formatDuration(dur)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {t.points.length >= 2 && (
                      <Pressable
                        onPress={() => {
                          setPlotMode(false);
                          setFollowTrack(t);
                          if (!tracking) setTracking(true);
                          let w = Infinity,
                            s = Infinity,
                            e2 = -Infinity,
                            n = -Infinity;
                          for (const p of t.points) {
                            if (p.lng < w) w = p.lng;
                            if (p.lat < s) s = p.lat;
                            if (p.lng > e2) e2 = p.lng;
                            if (p.lat > n) n = p.lat;
                          }
                          if (Number.isFinite(w)) {
                            mapRef.current?.fitBounds([w, s, e2, n]);
                          }
                          mapRef.current?.highlightTrack(null);
                          setTrackTapSheet(null);
                        }}
                        style={({ pressed }) => [
                          styles.primaryBtn,
                          {
                            backgroundColor: colors.primary,
                            opacity: pressed ? 0.85 : 1,
                            marginTop: 4,
                          },
                        ]}
                      >
                        <Feather
                          name="navigation"
                          size={16}
                          color={colors.primaryForeground}
                        />
                        <Text
                          style={[
                            styles.primaryBtnText,
                            { color: colors.primaryForeground },
                          ]}
                        >
                          Follow
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            {trackTapSheet.length > 1 && (
              <View style={styles.trackPickerDots}>
                {trackTapSheet.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.trackPickerDot,
                      { backgroundColor: colors.mutedForeground },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </Sheet>

      {/* Layers sheet */}
      <LayersSheet
        visible={layersOpen}
        onClose={() => setLayersOpen(false)}
        baseLayer={layers.base}
        overlays={layers.overlays}
        onSelectBase={setBaseLayer}
        onToggleOverlay={toggleOverlay}
      />

      {/* Add waypoint sheet */}
      <Sheet
        visible={!!pendingWaypoint}
        onClose={() => setPendingWaypoint(null)}
        title="New waypoint"
      >
        {pendingWaypoint && (
          <View style={{ gap: 14 }}>
            {pendingWaypoint.photoUri ? (
              <Image
                source={{ uri: pendingWaypoint.photoUri }}
                style={[
                  styles.waypointPhotoPreview,
                  { backgroundColor: colors.muted },
                ]}
                resizeMode="cover"
              />
            ) : null}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Location
            </Text>
            <Text style={[styles.coordsValue, { color: colors.foreground }]}>
              {pendingWaypoint.lat.toFixed(5)}°,{" "}
              {pendingWaypoint.lng.toFixed(5)}°
            </Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Name
            </Text>
            <TextInput
              value={waypointName}
              onChangeText={setWaypointName}
              placeholder="Trailhead, campsite, observation…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.card,
                },
              ]}
            />
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Field note
            </Text>
            <TextInput
              value={waypointNotes}
              onChangeText={setWaypointNotes}
              multiline
              placeholder={
                pendingWaypoint.photoUri
                  ? "Caption this photo — e.g. waterfall along the hike (optional)"
                  : "e.g. start of the steep section (optional)"
              }
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                styles.inputMulti,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.card,
                },
              ]}
            />
            {pendingWaypoint?.trackId ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={[
                      styles.label,
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  >
                    Publish to community map
                  </Text>
                  <Text
                    style={[styles.label, { color: colors.mutedForeground }]}
                  >
                    Share this waypoint publicly
                  </Text>
                </View>
                <Switch
                  value={waypointPublish}
                  onValueChange={setWaypointPublish}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                  thumbColor={colors.card}
                />
              </View>
            ) : null}
            <Pressable
              onPress={confirmWaypoint}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather
                name="check"
                size={18}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Save waypoint
              </Text>
            </Pressable>
          </View>
        )}
      </Sheet>

      {/* Download offline area sheet */}
      <Sheet
        visible={downloadOpen}
        onClose={() => {
          if (!downloadProgress) setDownloadOpen(false);
        }}
        title="Save area for offline"
      >
        <View style={{ gap: 14 }}>
          {downloadProgress ? (
            <View
              style={{ alignItems: "center", paddingVertical: 24, gap: 14 }}
            >
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.coordsValue, { color: colors.foreground }]}>
                {downloadProgress.done} / {downloadProgress.total} tiles
              </Text>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Downloading map tiles for offline use…
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Region name
              </Text>
              <TextInput
                value={downloadName}
                onChangeText={setDownloadName}
                placeholder="My survey area"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                  },
                ]}
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                Detail levels (deeper = sharper but more storage)
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setDownloadZoom(n)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor:
                          downloadZoom === n ? colors.primary : colors.border,
                        backgroundColor:
                          downloadZoom === n
                            ? colors.primary
                            : colors.background,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          downloadZoom === n
                            ? colors.primaryForeground
                            : colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      +{n}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View
                style={[
                  styles.summary,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <View style={styles.summaryRow}>
                  <Text
                    style={[styles.label, { color: colors.mutedForeground }]}
                  >
                    Tiles to download
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {totalDownloadJobs}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text
                    style={[styles.label, { color: colors.mutedForeground }]}
                  >
                    Layers included
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {layerIdsToDownload.length}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text
                    style={[styles.label, { color: colors.mutedForeground }]}
                  >
                    Currently cached
                  </Text>
                  <Text
                    style={[styles.coordsValue, { color: colors.foreground }]}
                  >
                    {cacheStats.count} tiles ·{" "}
                    {(cacheStats.bytes / 1024 / 1024).toFixed(1)}MB
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={startDownload}
                disabled={!view || totalDownloadJobs === 0}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      !view || totalDownloadJobs === 0
                        ? 0.4
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
              >
                <Feather
                  name="download"
                  size={18}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Download
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  recordPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  recordText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  container: { flex: 1 },
  topBar: { position: "absolute", alignItems: "center" },
  topPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 10,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  topPillText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  topPillSub: { fontFamily: "Inter_500Medium", fontSize: 12 },
  divider: { width: 1, height: 14 },
  rightControls: { position: "absolute", gap: 10, alignItems: "center" },
  bottomActions: { position: "absolute", alignItems: "flex-end", gap: 10 },
  gpsBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  coords: {
    position: "absolute",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    minWidth: 160,
  },
  coordsLabel: { fontFamily: "Inter_500Medium", fontSize: 11 },
  coordsValue: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  waypointPhotoPreview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 14,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  summary: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waypointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
  },
  waypointThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  modePanel: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  livePanel: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  livePanelCompact: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  livePanelHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  livePanelTitle: { fontFamily: "Inter_700Bold", fontSize: 13, flex: 1 },
  liveUnreadBadge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  liveUnreadBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9 },
  liveMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 7,
  },
  liveMessageText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  liveLinkAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
  },
  liveLinkActionText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  liveRetryAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveRetryActionText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  liveQuickReplies: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  liveQuickReply: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  liveQuickReplyText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  liveReplyRow: { flexDirection: "row", gap: 7, alignItems: "center" },
  liveReplyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  liveSend: {
    width: 33,
    height: 33,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  liveStopText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textAlign: "center",
  },
  liveShareSheet: { gap: 10, paddingBottom: 4 },
  liveNotice: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  modePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modePanelTitle: { fontFamily: "Inter_700Bold", fontSize: 15, flexShrink: 1 },
  modePanelHint: { fontFamily: "Inter_500Medium", fontSize: 11 },
  modeStatsRow: { flexDirection: "row", gap: 16 },
  modeStat: { gap: 2 },
  modeBtnRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  modeBtnPrimary: { borderWidth: 0 },
  modeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  selectedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedBarBtns: { flexDirection: "row", gap: 8, alignItems: "center" },
  selectedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  offRouteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bgFollowBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  bgFollowText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  trackPickerCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  trackPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trackPickerName: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  trackKindBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trackKindText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  trackPickerStats: {
    flexDirection: "row",
    gap: 16,
  },
  trackPickerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trackPickerStatText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  trackPickerDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  trackPickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.45,
  },
});
