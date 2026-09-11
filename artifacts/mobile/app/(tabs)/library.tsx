import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
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
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import {
  type CommunityDatasetSummary,
  type CommunityRegionSummary,
  getCommunityDataset,
  getCommunityDatasetStreamed,
  syncUsgsState,
  getUsgsStateStatus,
  UsgsImportProgress,
  listCommunityDatasets,
  listCommunityRegions,
  shareCommunityDataset,
} from "@/lib/community";
import {
  computeBounds,
  countFeatures,
  detectFormat,
  parseGPX,
  parseGeoJSON,
  parseKML,
  parseKMZ,
} from "@/lib/parsers";
import { clearTileCache, tileCacheSize } from "@/lib/tiles";
import type { Dataset, GeoJSONFeatureCollection } from "@/lib/types";
import { formatDistance } from "@/lib/units";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;

function prettifyGpxName(base: string): string {
  return base
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Human-readable byte size (KB / MB) for region/library stats. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

type SortOrigin = { lat: number; lng: number; label: string };

type CommunityBrowseMode = "near" | "region";

/** Centroid of a dataset's bounding box, or null if it has no bounds. */
function datasetCenter(
  c: CommunityDatasetSummary,
): { lat: number; lng: number } | null {
  if (
    c.boundsWest == null ||
    c.boundsSouth == null ||
    c.boundsEast == null ||
    c.boundsNorth == null
  ) {
    return null;
  }
  return {
    lat: (c.boundsNorth + c.boundsSouth) / 2,
    lng: (c.boundsEast + c.boundsWest) / 2,
  };
}

/** Great-circle distance between two coordinates, in meters. */
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type PendingImport = {
  name: string;
  format: Dataset["format"];
  geojson: GeoJSONFeatureCollection;
  bounds?: [number, number, number, number];
};

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    datasets,
    regions,
    addDataset,
    removeDataset,
    toggleDataset,
    setActiveOnly,
    removeRegion,
    settings,
  } = useMaps();
  const [importing, setImporting] = useState(false);
  const [cacheStats, setCacheStats] = useState<{
    count: number;
    bytes: number;
  }>({ count: 0, bytes: 0 });

  // Share-to-community dialog state
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareName, setShareName] = useState("");
  const [shareDescription, setShareDescription] = useState("");
  const [shareAuthor, setShareAuthor] = useState("");
  const [submittingShare, setSubmittingShare] = useState(false);

  // Community datasets list
  const [community, setCommunity] = useState<CommunityDatasetSummary[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityLoadedOnce, setCommunityLoadedOnce] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    id: string;
    loaded: number;
    total: number;
  } | null>(null);
  // Per-region USGS National Digital Trails import state.
  const [usgsImporting, setUsgsImporting] = useState(false);
  const [usgsProgress, setUsgsProgress] = useState<UsgsImportProgress | null>(
    null,
  );
  // Monotonic token so a slow earlier request can't overwrite a newer result.
  const communityReqSeq = useRef(0);
  // Same idea for region drilldowns: switching regions quickly must not let a
  // stale fetch repopulate the list for the wrong region.
  const regionReqSeq = useRef(0);
  // Always-fresh snapshot of local datasets for dedup checks inside async callbacks.
  const datasetsRef = useRef(datasets);
  useEffect(() => {
    datasetsRef.current = datasets;
  }, [datasets]);

  // Community search + location-based sorting
  const [communitySearch, setCommunitySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortOrigin, setSortOrigin] = useState<SortOrigin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSearching, setPlaceSearching] = useState(false);

  // Browse-by-region state
  const [browseMode, setBrowseMode] = useState<CommunityBrowseMode>("near");
  const [regionsList, setRegionsList] = useState<CommunityRegionSummary[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [regionsLoadedOnce, setRegionsLoadedOnce] = useState(false);
  // The region the user drilled into (null = showing the region list).
  const [selectedRegion, setSelectedRegion] =
    useState<CommunityRegionSummary | null>(null);
  const [regionDatasets, setRegionDatasets] = useState<
    CommunityDatasetSummary[]
  >([]);
  const [regionDatasetsLoading, setRegionDatasetsLoading] = useState(false);
  const [regionDatasetsError, setRegionDatasetsError] = useState<string | null>(
    null,
  );
  // Bulk "Download all" progress for the selected region.
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    tileCacheSize().then(setCacheStats);
  }, [regions]);

  // Debounce the search box so each keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(communitySearch.trim()), 300);
    return () => clearTimeout(t);
  }, [communitySearch]);

  // Fetch only the nearest 50 datasets (or newest 50 when location is unknown),
  // letting the server do the distance ranking and text search instead of
  // pulling the entire community library to the device.
  const loadCommunity = useCallback(async () => {
    const seq = ++communityReqSeq.current;
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const list = await listCommunityDatasets({
        lat: sortOrigin?.lat,
        lng: sortOrigin?.lng,
        q: debouncedSearch || undefined,
        limit: 50,
      });
      if (seq !== communityReqSeq.current) return; // a newer request superseded us
      setCommunity(list);
      setCommunityLoadedOnce(true);
    } catch (err) {
      if (seq !== communityReqSeq.current) return;
      setCommunityError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === communityReqSeq.current) setCommunityLoading(false);
    }
  }, [sortOrigin, debouncedSearch]);

  useFocusEffect(
    useCallback(() => {
      loadCommunity();
    }, [loadCommunity]),
  );

  const loadRegions = useCallback(async () => {
    setRegionsLoading(true);
    setRegionsError(null);
    try {
      const list = await listCommunityRegions();
      setRegionsList(list);
      setRegionsLoadedOnce(true);
    } catch (err) {
      setRegionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegionsLoading(false);
    }
  }, []);

  // Lazily load the region index the first time the user switches to it.
  useEffect(() => {
    if (browseMode === "region" && !regionsLoadedOnce && !regionsLoading) {
      loadRegions();
    }
  }, [browseMode, regionsLoadedOnce, regionsLoading, loadRegions]);

  // Drill into a region: fetch every dataset tagged with it (cap is raised
  // server-side when a region filter is present).
  const openRegion = useCallback(async (region: CommunityRegionSummary) => {
    const seq = ++regionReqSeq.current;
    setSelectedRegion(region);
    setRegionDatasets([]);
    setRegionDatasetsError(null);
    setRegionDatasetsLoading(true);
    try {
      const list = await listCommunityDatasets({
        region: region.region,
        limit: 5000,
      });
      if (seq !== regionReqSeq.current) return; // a newer region superseded us
      setRegionDatasets(list);
    } catch (err) {
      if (seq !== regionReqSeq.current) return;
      setRegionDatasetsError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === regionReqSeq.current) setRegionDatasetsLoading(false);
    }
  }, []);

  const closeRegion = useCallback(() => {
    regionReqSeq.current++; // cancel any in-flight drilldown fetch
    setSelectedRegion(null);
    setRegionDatasets([]);
    setRegionDatasetsError(null);
  }, []);

  // Reset USGS import state when the user navigates to a different region.
  useEffect(() => {
    setUsgsImporting(false);
    setUsgsProgress(null);
  }, [selectedRegion?.region]);

  // Poll every 5 s while a USGS National Digital Trails import is running.
  useEffect(() => {
    if (!usgsImporting || !selectedRegion) return;
    const id = setInterval(async () => {
      try {
        const { inProgress, progress } = await getUsgsStateStatus(
          selectedRegion.region,
        );
        setUsgsProgress(progress);
        if (!inProgress) {
          setUsgsImporting(false);
          setUsgsProgress(null);
          // Refresh the region dataset list to show the new USGS trails.
          void openRegion(selectedRegion);
        }
      } catch {
        // Ignore transient errors — keep polling.
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [usgsImporting, selectedRegion]);

  // Auto-trigger USGS National Digital Trails import when a US state region
  // loads without any USGS trail data already present. No manual button needed.
  useEffect(() => {
    if (!selectedRegion || selectedRegion.kind !== "state") return;
    if (regionDatasetsLoading || usgsImporting) return;
    if (regionDatasets.some((d) => d.description?.includes("[usgs-trail]")))
      return;
    void (async () => {
      try {
        setUsgsImporting(true);
        const { status } = await syncUsgsState(selectedRegion.region);
        if (status === "exists") {
          setUsgsImporting(false);
          void openRegion(selectedRegion);
        }
        // "started" or "in_progress" → the polling effect above takes over.
      } catch {
        setUsgsImporting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegion, regionDatasetsLoading, regionDatasets]);

  // Default to "Near you" when location is already granted, without prompting —
  // the Map tab requests it, so it's usually granted by the time you get here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        setLocating(true);
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setSortOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Near you",
        });
      } catch {
        // Ignore — the user can tap "Near me" to grant access and retry.
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location needed",
          "Allow location access to sort community maps by distance from you.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setSortOrigin({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: "Near you",
      });
    } catch {
      Alert.alert(
        "Location unavailable",
        "Couldn’t get your current location. Try again or search for a place.",
      );
    } finally {
      setLocating(false);
    }
  }, []);

  const searchPlace = useCallback(async () => {
    const q = placeQuery.trim();
    if (!q) return;
    setPlaceSearching(true);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        Alert.alert(
          "Not found",
          `Couldn’t find “${q}”. Try a city, region, or landmark.`,
        );
        return;
      }
      const top = results[0];
      setSortOrigin({ lat: top.latitude, lng: top.longitude, label: q });
      setLocPickerOpen(false);
      setPlaceQuery("");
    } catch {
      Alert.alert(
        "Search failed",
        "Couldn’t look up that place. Check your connection and try again.",
      );
    } finally {
      setPlaceSearching(false);
    }
  }, [placeQuery]);

  const handleImport = async () => {
    try {
      setImporting(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      const fmt = detectFormat(file.name);
      if (!fmt) {
        Alert.alert(
          "Unsupported file",
          "Pick a GeoJSON (.geojson, .json), KML (.kml), KMZ (.kmz), or GPX (.gpx) file.",
        );
        return;
      }
      let fc;
      if (fmt === "kmz") {
        let base64: string;
        if (Platform.OS === "web" && file.uri.startsWith("data:")) {
          base64 = file.uri.split(",", 2)[1] ?? "";
        } else {
          base64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        fc = await parseKMZ(base64);
      } else {
        let text: string;
        if (Platform.OS === "web" && file.uri.startsWith("data:")) {
          const res = await fetch(file.uri);
          text = await res.text();
        } else {
          text = await FileSystem.readAsStringAsync(file.uri);
        }
        fc =
          fmt === "geojson"
            ? parseGeoJSON(text)
            : fmt === "kml"
              ? parseKML(text)
              : parseGPX(text);
      }
      if (countFeatures(fc) === 0) {
        Alert.alert(
          "Empty dataset",
          "No map features were found in this file.",
        );
        return;
      }
      const bounds = computeBounds(fc);
      const rawBaseName = file.name.replace(
        /\.(geojson|json|kml|kmz|gpx)$/i,
        "",
      );
      const baseName =
        fmt === "gpx" ? prettifyGpxName(rawBaseName) : rawBaseName;
      // Open the share dialog before committing
      setPending({ name: baseName, format: fmt, geojson: fc, bounds });
      setShareName(baseName);
      setShareDescription("");
      setShareAuthor("");
      setShareEnabled(false);
    } catch (err) {
      Alert.alert(
        "Import failed",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setImporting(false);
    }
  };

  const finalizeImport = async () => {
    if (!pending) return;
    const finalName = shareName.trim() || pending.name;
    setSubmittingShare(true);
    try {
      addDataset(finalName, pending.format, pending.geojson, pending.bounds);
      if (shareEnabled) {
        try {
          await shareCommunityDataset({
            name: finalName,
            description: shareDescription.trim() || null,
            format: pending.format,
            author: shareAuthor.trim() || null,
            geojson: pending.geojson,
          });
          loadCommunity();
        } catch (err) {
          Alert.alert(
            "Saved locally — sharing failed",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
      setPending(null);
    } finally {
      setSubmittingShare(false);
    }
  };

  const downloadCommunity = async (item: CommunityDatasetSummary) => {
    if (downloadingId) return;
    setDownloadingId(item.id);
    setDownloadProgress({ id: item.id, loaded: 0, total: item.sizeBytes });
    try {
      const detail = await getCommunityDatasetStreamed(
        item.id,
        item.sizeBytes,
        (loaded, total) => {
          setDownloadProgress({ id: item.id, loaded, total });
        },
      );
      const bounds: [number, number, number, number] | undefined =
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
      addDataset(detail.name, detail.format, detail.geojson, bounds, {
        communityId: detail.id,
        communityKind:
          detail.kind === "trail" || detail.kind === "road"
            ? detail.kind
            : undefined,
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
      loadCommunity();
    } catch (err) {
      Alert.alert(
        "Download failed",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  };

  // Bulk-import every not-yet-downloaded dataset in the selected region into the
  // local library. Fetches detail (geojson) one at a time to keep memory and
  // network bounded; already-downloaded routes (matched by communityId) are
  // skipped so re-running is cheap.
  const downloadAllInRegion = async () => {
    if (bulkProgress) return;
    const have = new Set<string>();
    for (const d of datasets) if (d.communityId) have.add(d.communityId);
    const pending = regionDatasets.filter((c) => !have.has(c.id));
    if (pending.length === 0) {
      Alert.alert(
        "Already downloaded",
        "Every route in this region is already in your library.",
      );
      return;
    }

    setBulkProgress({ done: 0, total: pending.length });
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      try {
        const detail = await getCommunityDataset(item.id);
        const bounds: [number, number, number, number] | undefined =
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
        addDataset(detail.name, detail.format, detail.geojson, bounds, {
          communityId: detail.id,
          communityKind:
            detail.kind === "trail" || detail.kind === "road"
              ? detail.kind
              : undefined,
        });
      } catch {
        failed++;
      }
      setBulkProgress({ done: i + 1, total: pending.length });
    }

    setBulkProgress(null);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
    const imported = pending.length - failed;
    Alert.alert(
      "Region downloaded",
      `Imported ${imported} route${imported === 1 ? "" : "s"}${
        failed ? ` · ${failed} failed` : ""
      }.`,
    );
    // Refresh download counts and region totals.
    loadCommunity();
    loadRegions();
  };

  // Open an already-downloaded community dataset on the map (focuses the route
  // and opens its detail sheet via the map's ?dataset= param).
  const viewOnMap = (ds?: Dataset) => {
    if (!ds) return;
    router.push({ pathname: "/", params: { dataset: ds.id } });
  };

  const confirmRemove = (ds: Dataset) => {
    Alert.alert("Remove dataset?", `“${ds.name}” will be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeDataset(ds.id),
      },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear offline tiles?",
      "All saved offline regions will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearTileCache();
            regions.forEach((r) => removeRegion(r.id));
            setCacheStats({ count: 0, bytes: 0 });
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: Dataset }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Pressable
        onPress={() => {
          setActiveOnly(item.id);
          router.push("/");
        }}
        style={styles.cardMain}
      >
        <View style={[styles.colorChip, { backgroundColor: item.color }]} />
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.communityKind === "trail" || item.communityKind === "road" ? (
            <View
              style={{ flexDirection: "row", marginTop: 2, marginBottom: 2 }}
            >
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 4,
                  backgroundColor:
                    item.communityKind === "road"
                      ? "rgba(200,122,42,0.15)"
                      : "rgba(80,120,80,0.15)",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    letterSpacing: 0.4,
                    color:
                      item.communityKind === "road"
                        ? "#c87a2a"
                        : colors.primary,
                  }}
                >
                  {item.communityKind === "road" ? "OFF-ROAD" : "TRAIL"}
                </Text>
              </View>
            </View>
          ) : null}
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            {item.format.toUpperCase()} · {countFeatures(item.geojson)}{" "}
            {countFeatures(item.geojson) === 1 ? "feature" : "features"}
          </Text>
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable
          onPress={() => toggleDataset(item.id)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather
            name={item.visible ? "eye" : "eye-off"}
            size={18}
            color={item.visible ? colors.primary : colors.mutedForeground}
          />
        </Pressable>
        <Pressable
          onPress={() => confirmRemove(item)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="trash-2" size={18} color={colors.destructive} />
        </Pressable>
      </View>
    </View>
  );

  const localByCommunityId = new Map<string, Dataset>();
  for (const d of datasets) {
    if (d.communityId) localByCommunityId.set(d.communityId, d);
  }

  // The server already returns the right rows in the right order (nearest-first
  // when we have an origin, newest-first otherwise, filtered by the search term).
  // Here we only attach a display distance for the "X away" label.
  const displayedCommunity = useMemo(() => {
    const origin = sortOrigin;
    return community.map((c) => {
      const center = origin ? datasetCenter(c) : null;
      return {
        c,
        dist:
          origin && center
            ? haversineMeters(origin, center)
            : Number.POSITIVE_INFINITY,
      };
    });
  }, [community, sortOrigin]);

  // One community dataset row, reused by the "near you" list and the per-region
  // drilldown. `dist` is a display distance in meters or Infinity (no label).
  const renderCommunityCard = (c: CommunityDatasetSummary, dist: number) => {
    const localDs = localByCommunityId.get(c.id);
    const alreadyHave = !!localDs;
    const isDownloading = downloadingId === c.id;
    const progress =
      isDownloading && downloadProgress?.id === c.id ? downloadProgress : null;
    const distLabel = Number.isFinite(dist)
      ? `${formatDistance(dist, settings.units)} away`
      : null;
    // Overpass datasets are regional background layers, not individual routes.
    const isOverpass = !!c.description?.includes("[overpass");
    return (
      <View
        key={c.id}
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardMain}>
          <Feather
            name={
              c.kind === "road"
                ? "navigation"
                : c.kind === "trail"
                  ? "activity"
                  : "globe"
            }
            size={18}
            color={c.kind === "road" ? "#c87a2a" : colors.primary}
            style={{ marginRight: 4 }}
          />
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: colors.foreground, flexShrink: 1 },
                ]}
                numberOfLines={1}
              >
                {c.name}
              </Text>
              {isOverpass ? (
                <View
                  style={{
                    backgroundColor: colors.border,
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.mutedForeground,
                      fontWeight: "600",
                    }}
                  >
                    REGIONAL LAYER
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[styles.cardMeta, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {distLabel ? (
                <Text style={{ color: colors.primary }}>{distLabel} · </Text>
              ) : null}
              {isOverpass ? (
                <>
                  {c.featureCount.toLocaleString()} segments
                  {c.distanceMeters != null
                    ? ` · ${formatDistance(c.distanceMeters, settings.units)} total`
                    : ""}
                </>
              ) : (
                <>
                  {c.format.toUpperCase()} ·{" "}
                  {c.distanceMeters != null
                    ? formatDistance(c.distanceMeters, settings.units)
                    : `${c.featureCount} ${c.featureCount === 1 ? "feature" : "features"}`}
                  {c.author
                    ? ` · by ${/^supportal\b/i.test(c.author) ? "Adventure Collective" : c.author}`
                    : ""}
                </>
              )}{" "}
              · {c.downloadCount}{" "}
              {c.downloadCount === 1 ? "download" : "downloads"}
            </Text>
            {(() => {
              const desc = (c.description ?? "")
                .replace(/\[supportal:[^\]]*\]/gi, "")
                .replace(/\[overpass(?:-[^\]:]*)?\:[^\]]*\]/gi, "")
                .trim();
              return desc ? (
                <Text
                  style={[
                    styles.cardMeta,
                    { color: colors.mutedForeground, marginTop: 4 },
                  ]}
                  numberOfLines={2}
                >
                  {desc}
                </Text>
              ) : null;
            })()}
          </View>
        </View>
        {/* Download progress bar — shown below the text block while fetching */}
        {progress && progress.total > 0 ? (
          <View style={{ marginTop: 6, gap: 2 }}>
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor: colors.border,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: colors.primary,
                  width: `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%`,
                }}
              />
            </View>
            <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={() =>
            alreadyHave ? viewOnMap(localDs) : downloadCommunity(c)
          }
          disabled={isDownloading}
          hitSlop={8}
          style={({ pressed }) => [
            styles.downloadBtn,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Feather
                name={alreadyHave ? "map" : "download"}
                size={14}
                color={colors.primaryForeground}
              />
              <Text
                style={[styles.importText, { color: colors.primaryForeground }]}
              >
                {alreadyHave
                  ? "View on Map"
                  : isOverpass
                    ? `Download (${formatBytes(c.sizeBytes)})`
                    : "Download"}
              </Text>
            </>
          )}
        </Pressable>
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
            SCENDERS
          </Text>
          <Text style={[styles.h1, { color: colors.foreground }]}>Saved</Text>
        </View>
        <Pressable
          onPress={handleImport}
          disabled={importing}
          style={({ pressed }) => [
            styles.importBtn,
            {
              backgroundColor: colors.primary,
              opacity: importing ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather name="upload" size={16} color={colors.primaryForeground} />
          <Text
            style={[styles.importText, { color: colors.primaryForeground }]}
          >
            {importing ? "Importing…" : "Import"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={datasets}
        keyExtractor={(d) => d.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 96,
          gap: 10,
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <Text
              style={[styles.sectionTitle, { color: colors.mutedForeground }]}
            >
              Datasets
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather
              name="upload-cloud"
              size={32}
              color={colors.mutedForeground}
            />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No datasets yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Import KML, GPX, or GeoJSON files exported from Avenza Maps,
              Google Earth, Garmin, or any GIS tool — or browse community maps
              below.
            </Text>
            <Pressable
              onPress={handleImport}
              style={({ pressed }) => [
                styles.emptyBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather
                name="upload"
                size={16}
                color={colors.primaryForeground}
              />
              <Text
                style={[styles.importText, { color: colors.primaryForeground }]}
              >
                Import a dataset
              </Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          <View style={{ marginTop: 24, gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.mutedForeground }]}
              >
                Community maps
              </Text>
              <Pressable
                onPress={() => {
                  if (browseMode === "region") loadRegions();
                  else loadCommunity();
                }}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { opacity: pressed ? 0.5 : 1 },
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.segmented,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {(
                [
                  { key: "near", label: "Near you", icon: "map-pin" },
                  { key: "region", label: "By region", icon: "globe" },
                ] as const
              ).map((opt) => {
                const active = browseMode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      setBrowseMode(opt.key);
                      if (opt.key === "near") closeRegion();
                    }}
                    style={[
                      styles.segmentBtn,
                      active && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Feather
                      name={opt.icon}
                      size={13}
                      color={
                        active
                          ? colors.primaryForeground
                          : colors.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {browseMode === "near" && communityLoadedOnce && !communityError ? (
              <>
                <View
                  style={[
                    styles.searchRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="search"
                    size={15}
                    color={colors.mutedForeground}
                  />
                  <TextInput
                    value={communitySearch}
                    onChangeText={setCommunitySearch}
                    placeholder="Search community maps"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    style={[styles.searchInput, { color: colors.foreground }]}
                  />
                  {communitySearch ? (
                    <Pressable
                      onPress={() => setCommunitySearch("")}
                      hitSlop={8}
                    >
                      <Feather
                        name="x"
                        size={15}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.locRow}>
                  <Feather
                    name={sortOrigin ? "map-pin" : "clock"}
                    size={14}
                    color={sortOrigin ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[styles.locLabel, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {sortOrigin ? sortOrigin.label : "Newest first"}
                  </Text>
                  {locating ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.mutedForeground}
                    />
                  ) : null}
                  <Pressable
                    onPress={useMyLocation}
                    disabled={locating}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.locBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name="navigation"
                      size={13}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.locBtnText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Near me
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLocPickerOpen(true)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.locBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name="search"
                      size={13}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.locBtnText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Change
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {browseMode === "region" ? (
              selectedRegion ? (
                <>
                  <Pressable
                    onPress={closeRegion}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.backRow,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Feather
                      name="chevron-left"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={[styles.backText, { color: colors.primary }]}>
                      All regions
                    </Text>
                  </Pressable>

                  <View
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.cardTitle, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {selectedRegion.region}
                      </Text>
                      <Text
                        style={[
                          styles.cardMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {selectedRegion.datasetCount}{" "}
                        {selectedRegion.datasetCount === 1 ? "route" : "routes"}{" "}
                        · {formatBytes(selectedRegion.totalSizeBytes)}
                        {selectedRegion.totalDistanceMeters != null
                          ? ` · ${formatDistance(selectedRegion.totalDistanceMeters, settings.units)} total`
                          : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={downloadAllInRegion}
                      disabled={!!bulkProgress || regionDatasetsLoading}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.downloadBtn,
                        {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      {bulkProgress ? (
                        <>
                          <ActivityIndicator
                            size="small"
                            color={colors.primaryForeground}
                          />
                          <Text
                            style={[
                              styles.importText,
                              { color: colors.primaryForeground },
                            ]}
                          >
                            {bulkProgress.done}/{bulkProgress.total}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Feather
                            name="download"
                            size={14}
                            color={colors.primaryForeground}
                          />
                          <Text
                            style={[
                              styles.importText,
                              { color: colors.primaryForeground },
                            ]}
                          >
                            Download all
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>

                  {/* USGS National Digital Trails banner — auto-import runs in
                      the background; this banner shows progress while it's in
                      flight and disappears once the data is in the library. */}
                  {selectedRegion.kind === "state" &&
                  !regionDatasetsLoading &&
                  usgsImporting ? (
                    <View
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: colors.foreground },
                          ]}
                        >
                          USGS National Trails
                        </Text>
                        <Text
                          style={[
                            styles.cardMeta,
                            { color: colors.mutedForeground, marginBottom: 6 },
                          ]}
                        >
                          {usgsProgress && usgsProgress.total > 0
                            ? `Importing trails — ${usgsProgress.done} / ${usgsProgress.total}`
                            : "Fetching trail data…"}
                        </Text>
                        {usgsProgress && usgsProgress.total > 0 ? (
                          <View
                            style={{
                              height: 4,
                              borderRadius: 2,
                              backgroundColor: colors.border,
                              overflow: "hidden",
                              marginRight: 12,
                            }}
                          >
                            <View
                              style={{
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: "#2a6b4a",
                                width: `${Math.round((usgsProgress.done / usgsProgress.total) * 100)}%`,
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                      <ActivityIndicator
                        size="small"
                        color="#2a6b4a"
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  ) : null}

                  {regionDatasetsLoading ? (
                    <View
                      style={[
                        styles.cacheCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <ActivityIndicator color={colors.primary} />
                      <Text
                        style={[
                          styles.cardMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Loading routes…
                      </Text>
                    </View>
                  ) : regionDatasetsError ? (
                    <View
                      style={[
                        styles.cacheCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name="wifi-off"
                        size={16}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.cardMeta,
                          { color: colors.mutedForeground, flex: 1 },
                        ]}
                        numberOfLines={2}
                      >
                        Couldn’t load this region’s routes.
                      </Text>
                    </View>
                  ) : (
                    regionDatasets.map((c) =>
                      renderCommunityCard(c, Number.POSITIVE_INFINITY),
                    )
                  )}
                </>
              ) : regionsLoading ? (
                <View
                  style={[
                    styles.cacheCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ActivityIndicator color={colors.primary} />
                  <Text
                    style={[styles.cardMeta, { color: colors.mutedForeground }]}
                  >
                    Loading regions…
                  </Text>
                </View>
              ) : regionsError ? (
                <View
                  style={[
                    styles.cacheCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="wifi-off"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.cardMeta,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                    numberOfLines={2}
                  >
                    Couldn’t reach the community library.
                  </Text>
                </View>
              ) : regionsList.length === 0 ? (
                <View
                  style={[
                    styles.cacheCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="globe"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.cardMeta,
                      { color: colors.mutedForeground, flex: 1 },
                    ]}
                  >
                    No regions yet — share some maps to populate this view.
                  </Text>
                </View>
              ) : (
                regionsList.map((r) => (
                  <Pressable
                    key={`${r.kind}:${r.region}`}
                    onPress={() => openRegion(r)}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={r.kind === "state" ? "flag" : "globe"}
                      size={18}
                      color={colors.primary}
                      style={{ marginRight: 4 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.cardTitle, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {r.region}
                      </Text>
                      <Text
                        style={[
                          styles.cardMeta,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {r.datasetCount}{" "}
                        {r.datasetCount === 1 ? "route" : "routes"} ·{" "}
                        {formatBytes(r.totalSizeBytes)}
                        {r.totalDistanceMeters != null
                          ? ` · ${formatDistance(r.totalDistanceMeters, settings.units)}`
                          : ""}
                      </Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                ))
              )
            ) : communityLoading && community.length === 0 ? (
              <View
                style={[
                  styles.cacheCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator color={colors.primary} />
                <Text
                  style={[styles.cardMeta, { color: colors.mutedForeground }]}
                >
                  Loading community maps…
                </Text>
              </View>
            ) : communityError ? (
              <View
                style={[
                  styles.cacheCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather
                  name="wifi-off"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.cardMeta,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                  numberOfLines={2}
                >
                  Couldn’t reach the community library.
                </Text>
              </View>
            ) : community.length === 0 && !communitySearch.trim() ? (
              <View
                style={[
                  styles.cacheCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather
                  name="globe"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.cardMeta,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                >
                  No community maps yet — be the first to share one when you
                  import.
                </Text>
              </View>
            ) : displayedCommunity.length === 0 ? (
              <View
                style={[
                  styles.cacheCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather
                  name="search"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.cardMeta,
                    { color: colors.mutedForeground, flex: 1 },
                  ]}
                >
                  No community maps match “{communitySearch.trim()}”.
                </Text>
              </View>
            ) : (
              displayedCommunity.map(({ c, dist }) =>
                renderCommunityCard(c, dist),
              )
            )}

            <Text
              style={[
                styles.sectionTitle,
                { color: colors.mutedForeground, marginTop: 16 },
              ]}
            >
              Offline tiles
            </Text>
            <View
              style={[
                styles.cacheCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {regions.length}{" "}
                  {regions.length === 1 ? "saved region" : "saved regions"}
                </Text>
                <Text
                  style={[styles.cardMeta, { color: colors.mutedForeground }]}
                >
                  {cacheStats.count} tiles ·{" "}
                  {(cacheStats.bytes / 1024 / 1024).toFixed(1)}MB cached
                </Text>
              </View>
              {cacheStats.count > 0 && (
                <Pressable
                  onPress={handleClearCache}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather
                    name="trash-2"
                    size={18}
                    color={colors.destructive}
                  />
                </Pressable>
              )}
            </View>
            {regions.map((r) => (
              <View
                key={r.id}
                style={[
                  styles.regionRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather name="hard-drive" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {r.name}
                  </Text>
                  <Text
                    style={[styles.cardMeta, { color: colors.mutedForeground }]}
                  >
                    Zoom {r.minZoom}–{r.maxZoom} · {r.tileCount} tiles
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeRegion(r.id)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        }
      />

      {/* Share-on-import modal */}
      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingShare && setPending(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Save dataset
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              {pending
                ? `${pending.format.toUpperCase()} · ${countFeatures(
                    pending.geojson,
                  )} features`
                : ""}
            </Text>

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              Name
            </Text>
            <TextInput
              value={shareName}
              onChangeText={setShareName}
              placeholder="Dataset name"
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

            <View style={styles.shareRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Share with community
                </Text>
                <Text
                  style={[styles.cardMeta, { color: colors.mutedForeground }]}
                >
                  Other Scenders Ride users can browse and download this map.
                </Text>
              </View>
              <Switch
                value={shareEnabled}
                onValueChange={setShareEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            {shareEnabled && (
              <>
                <Text
                  style={[styles.fieldLabel, { color: colors.mutedForeground }]}
                >
                  Description (optional)
                </Text>
                <TextInput
                  value={shareDescription}
                  onChangeText={setShareDescription}
                  placeholder="What is this map of?"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={3}
                  style={[
                    styles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      minHeight: 64,
                      textAlignVertical: "top",
                    },
                  ]}
                />
                <Text
                  style={[styles.fieldLabel, { color: colors.mutedForeground }]}
                >
                  Your handle (optional)
                </Text>
                <TextInput
                  value={shareAuthor}
                  onChangeText={setShareAuthor}
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
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => !submittingShare && setPending(null)}
                disabled={submittingShare}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={[styles.importText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={finalizeImport}
                disabled={submittingShare}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    opacity: submittingShare ? 0.6 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {submittingShare ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Text
                    style={[
                      styles.importText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {shareEnabled ? "Save & share" : "Save"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={locPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLocPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Search a location
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Find community maps near a city, region, or landmark.
            </Text>
            <TextInput
              value={placeQuery}
              onChangeText={setPlaceQuery}
              placeholder="e.g. Asheville, NC"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={searchPlace}
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
                onPress={() => setLocPickerOpen(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.importText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={searchPlace}
                disabled={placeSearching || !placeQuery.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                    opacity:
                      placeSearching || !placeQuery.trim()
                        ? 0.6
                        : pressed
                          ? 0.85
                          : 1,
                  },
                ]}
              >
                {placeSearching ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.primaryForeground}
                  />
                ) : (
                  <Text
                    style={[
                      styles.importText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Search
                  </Text>
                )}
              </Pressable>
            </View>
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
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  importText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  colorChip: { width: 8, height: 36, borderRadius: 4 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardMeta: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },
  supportalBanner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  supportalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  supportalMeta: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  supportalBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 76,
  },
  supportalBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
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
  cacheCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  regionRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  backText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalSub: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    padding: 0,
  },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  locLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  locBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  locBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingVertical: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 100,
    alignItems: "center",
  },
});
