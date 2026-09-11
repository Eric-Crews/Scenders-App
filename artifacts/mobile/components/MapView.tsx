import { Feather } from "@expo/vector-icons";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useColors } from "@/hooks/useColors";
import { getLeafletHtml } from "@/lib/leafletHtml";
import type { BaseLayerId, OverlayLayerId } from "@/lib/mapLayers";
import type { Dataset, Track, TrackPoint, Waypoint } from "@/lib/types";

export type OfflineManifest = Record<string, Record<string, string>>;

export type MapViewHandle = {
  setMe: (
    loc: { latitude: number; longitude: number; accuracy?: number } | null,
  ) => void;
  setLiveTrack: (points: TrackPoint[]) => void;
  setLiveFollowedRoute: (
    route: { name: string; points: Array<{ lat: number; lng: number }> } | null,
  ) => void;
  setElevationMarker: (loc: { lat: number; lng: number } | null) => void;
  setClimbHighlight: (path: { lat: number; lng: number }[] | null) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (bounds: [number, number, number, number]) => void;
  setOnlineEnabled: (enabled: boolean) => void;
  setOfflineTiles: (manifest: OfflineManifest) => void;
  setActiveBase: (id: BaseLayerId) => void;
  setActiveOverlays: (ids: OverlayLayerId[]) => void;
  invalidate: () => void;
  highlightTrack: (id: string | null) => void;
};

type Props = {
  datasets: Dataset[];
  waypoints: Waypoint[];
  tracks: Track[];
  liveTrack: TrackPoint[];
  liveFollowedRoute?: {
    name: string;
    points: Array<{ lat: number; lng: number }>;
  } | null;
  offlineManifest: OfflineManifest;
  onlineEnabled: boolean;
  baseLayer: BaseLayerId;
  overlays: OverlayLayerId[];
  plotMode?: boolean;
  plotPoints?: { lat: number; lng: number }[];
  plotSelectedIndex?: number | null;
  onPlotTap?: (lat: number, lng: number) => void;
  onPlotMove?: (index: number, lat: number, lng: number) => void;
  onPlotInsert?: (index: number, lat: number, lng: number) => void;
  onPlotVertexTap?: (index: number) => void;
  onLongPress: (lat: number, lng: number) => void;
  onDatasetTap?: (id: string) => void;
  onTrackTap?: (ids: string[]) => void;
  onView?: (v: {
    lat: number;
    lng: number;
    zoom: number;
    bounds: [number, number, number, number];
  }) => void;
  onReady?: () => void;
};

const MapViewComponent = forwardRef<MapViewHandle, Props>(
  function MapViewComponent(
    {
      datasets,
      waypoints,
      tracks,
      liveTrack,
      liveFollowedRoute,
      offlineManifest,
      onlineEnabled,
      baseLayer,
      overlays,
      plotMode = false,
      plotPoints,
      plotSelectedIndex,
      onPlotTap,
      onPlotMove,
      onPlotInsert,
      onPlotVertexTap,
      onLongPress,
      onDatasetTap,
      onTrackTap,
      onView,
      onReady,
    },
    ref,
  ) {
    const colors = useColors();
    const webRef = useRef<WebView>(null);
    const [html, setHtml] = useState<string | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      let mounted = true;
      getLeafletHtml().then((h) => {
        if (mounted) setHtml(h);
      });
      return () => {
        mounted = false;
      };
    }, []);

    const inject = (script: string) => {
      webRef.current?.injectJavaScript(script + "; true;");
    };

    useImperativeHandle(ref, () => ({
      setMe: (loc) => inject(`window.FM && FM.setMe(${JSON.stringify(loc)})`),
      setLiveTrack: (pts) =>
        inject(`window.FM && FM.setLiveTrack(${JSON.stringify(pts)})`),
      setLiveFollowedRoute: (route) =>
        inject(
          `window.FM && FM.setLiveFollowedRoute(${JSON.stringify(route)})`,
        ),
      setElevationMarker: (loc) =>
        inject(`window.FM && FM.setElevationMarker(${JSON.stringify(loc)})`),
      setClimbHighlight: (path) =>
        inject(`window.FM && FM.setClimbHighlight(${JSON.stringify(path)})`),
      flyTo: (lat, lng, zoom) =>
        inject(`window.FM && FM.flyTo(${lat}, ${lng}, ${zoom ?? "null"})`),
      fitBounds: (b) =>
        inject(`window.FM && FM.fitBounds(${JSON.stringify(b)})`),
      setOnlineEnabled: (v) =>
        inject(`window.FM && FM.setOnlineEnabled(${v ? "true" : "false"})`),
      setOfflineTiles: (m) =>
        inject(`window.FM && FM.setOfflineTiles(${JSON.stringify(m)})`),
      setActiveBase: (id) =>
        inject(`window.FM && FM.setActiveBase(${JSON.stringify(id)})`),
      setActiveOverlays: (ids) =>
        inject(`window.FM && FM.setActiveOverlays(${JSON.stringify(ids)})`),
      invalidate: () => inject(`window.FM && FM.invalidate()`),
      highlightTrack: (id) =>
        inject(`window.FM && FM.highlightTrack(${JSON.stringify(id)})`),
    }));

    // Push datasets / waypoints when they change
    useEffect(() => {
      if (!ready) return;
      const safe = datasets.map((d) => ({
        id: d.id,
        visible: d.visible,
        color: d.color,
        communityKind: d.communityKind ?? null,
        geojson: d.geojson,
      }));
      inject(`window.FM && FM.renderDatasets(${JSON.stringify(safe)})`);
    }, [datasets, ready]);

    useEffect(() => {
      if (!ready) return;
      const safe = waypoints.map((w) => ({
        name: w.name,
        latitude: w.latitude,
        longitude: w.longitude,
        notes: w.notes ?? "",
      }));
      inject(`window.FM && FM.renderWaypoints(${JSON.stringify(safe)})`);
    }, [waypoints, ready]);

    useEffect(() => {
      if (!ready) return;
      const safe = tracks.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        points: t.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      }));
      inject(`window.FM && FM.renderTracks(${JSON.stringify(safe)})`);
    }, [tracks, ready]);

    useEffect(() => {
      if (!ready) return;
      const safe = liveTrack.map((p) => ({ lat: p.lat, lng: p.lng }));
      inject(`window.FM && FM.setLiveTrack(${JSON.stringify(safe)})`);
    }, [liveTrack, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(
        `window.FM && FM.setLiveFollowedRoute(${JSON.stringify(liveFollowedRoute ?? null)})`,
      );
    }, [liveFollowedRoute, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(
        `window.FM && FM.setOnlineEnabled(${onlineEnabled ? "true" : "false"})`,
      );
    }, [onlineEnabled, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(
        `window.FM && FM.setOfflineTiles(${JSON.stringify(offlineManifest)})`,
      );
    }, [offlineManifest, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(`window.FM && FM.setActiveBase(${JSON.stringify(baseLayer)})`);
    }, [baseLayer, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(`window.FM && FM.setActiveOverlays(${JSON.stringify(overlays)})`);
    }, [overlays, ready]);

    useEffect(() => {
      if (!ready) return;
      inject(`window.FM && FM.setPlotMode(${plotMode ? "true" : "false"})`);
    }, [plotMode, ready]);

    useEffect(() => {
      if (!ready) return;
      const safe = (plotPoints ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
      const sel =
        typeof plotSelectedIndex === "number" ? plotSelectedIndex : -1;
      inject(`window.FM && FM.renderPlot(${JSON.stringify(safe)}, ${sel})`);
    }, [plotPoints, plotSelectedIndex, ready]);

    const handleMessage = (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as
          | { type: "ready" }
          | { type: "longpress"; lat: number; lng: number }
          | { type: "plotTap"; lat: number; lng: number }
          | { type: "plotMove"; index: number; lat: number; lng: number }
          | { type: "plotInsert"; index: number; lat: number; lng: number }
          | { type: "plotVertexTap"; index: number }
          | { type: "datasetTap"; id: string }
          | { type: "trackTap"; ids: string[] }
          | {
              type: "view";
              lat: number;
              lng: number;
              zoom: number;
              bounds: [number, number, number, number];
            };
        if (msg.type === "ready") {
          setReady(true);
          onReady?.();
        } else if (msg.type === "longpress") {
          onLongPress(msg.lat, msg.lng);
        } else if (msg.type === "plotTap") {
          onPlotTap?.(msg.lat, msg.lng);
        } else if (msg.type === "plotMove") {
          onPlotMove?.(msg.index, msg.lat, msg.lng);
        } else if (msg.type === "plotInsert") {
          onPlotInsert?.(msg.index, msg.lat, msg.lng);
        } else if (msg.type === "plotVertexTap") {
          onPlotVertexTap?.(msg.index);
        } else if (msg.type === "datasetTap") {
          onDatasetTap?.(msg.id);
        } else if (msg.type === "trackTap") {
          onTrackTap?.(msg.ids);
        } else if (msg.type === "view") {
          onView?.({
            lat: msg.lat,
            lng: msg.lng,
            zoom: msg.zoom,
            bounds: msg.bounds,
          });
        }
      } catch {
        // ignore
      }
    };

    if (Platform.OS === "web") {
      return (
        <View style={[styles.fallback, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.fallbackCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="smartphone" size={28} color={colors.primary} />
            <Text style={[styles.fallbackTitle, { color: colors.foreground }]}>
              Open Scenders Ride on your phone
            </Text>
            <Text
              style={[styles.fallbackText, { color: colors.mutedForeground }]}
            >
              The map view runs on real devices via Expo Go. The browser preview
              is best-effort — Library, Waypoints, and About work here, but
              Leaflet needs a native WebView for offline tiles and GPS to work
              properly.
            </Text>
            <Text
              style={[styles.fallbackHint, { color: colors.mutedForeground }]}
            >
              Scan the Expo QR code from the workflow, or open this URL in Expo
              Go.
            </Text>
          </View>
        </View>
      );
    }

    if (!html) {
      return (
        <View style={[styles.loader, { backgroundColor: colors.muted }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    return (
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "about:blank" }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        style={[styles.web, { backgroundColor: colors.muted }]}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        allowFileAccess
        mixedContentMode="always"
      />
    );
  },
);

export default MapViewComponent;

const styles = StyleSheet.create({
  web: { flex: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fallbackCard: {
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  fallbackTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginTop: 4,
  },
  fallbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  fallbackHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
});
