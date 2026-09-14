import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/lib/auth";
import { datasetRouteCoords } from "@/lib/datasetRoute";
import {
  DATASET_COLORS,
  ROAD_COLORS,
  type Dataset,
  type GeoJSONFeatureCollection,
  type OfflineRegion,
  type Track,
  type Waypoint,
  genId,
} from "@/lib/types";

function isUsableSavedDataset(dataset: Dataset): boolean {
  return !dataset.communityId || datasetRouteCoords(dataset.geojson).length >= 2;
}
import {
  DEFAULT_BASE_LAYER,
  DEFAULT_OVERLAYS,
  type BaseLayerId,
  type OverlayLayerId,
  BASE_LAYER_IDS,
  OVERLAY_LAYER_IDS,
} from "@/lib/mapLayers";
import { removePhoto } from "@/lib/photos";
import * as sync from "@/lib/sync";
import { OFF_ROUTE_THRESHOLD_VALUES, type UnitSystem } from "@/lib/units";

const KEY_DATASETS = "scenders.datasets.v1";
const KEY_WAYPOINTS = "scenders.waypoints.v1";
const KEY_REGIONS = "scenders.regions.v1";
const KEY_TRACKS = "scenders.tracks.v1";
const KEY_ACTIVE = "scenders.active.v1";
const KEY_LAYERS = "scenders.layers.v1";
const KEY_SETTINGS = "scenders.settings.v1";
const KEY_MIGRATED_PREFIX = "scenders.migrated.v1.";

type ActiveState = {
  datasetIds: string[];
};

type LayersState = {
  base: BaseLayerId;
  overlays: OverlayLayerId[];
};


/** Device-local preferences (never synced to the cloud). */
export type Settings = {
  /** Haptic buzz when crossing the off-route threshold (and back). */
  offRouteAlerts: boolean;
  /** Spoken cue (TTS) alongside the haptic alert. */
  offRouteVoice: boolean;
  /** Distance (meters) from the route line that counts as off route. */
  offRouteThreshold: number;
  /** Display unit system for distances and elevations. */
  units: UnitSystem;
};

const DEFAULT_SETTINGS: Settings = {
  offRouteAlerts: true,
  offRouteVoice: false,
  offRouteThreshold: 50,
  units: "imperial",
};

type Ctx = {
  ready: boolean;
  datasets: Dataset[];
  waypoints: Waypoint[];
  regions: OfflineRegion[];
  tracks: Track[];
  active: ActiveState;
  layers: LayersState;
  settings: Settings;
  syncStatus: "idle" | "syncing" | "error";
  updateSettings: (patch: Partial<Settings>) => void;
  setBaseLayer: (id: BaseLayerId) => void;
  toggleOverlay: (id: OverlayLayerId) => void;
  setOverlays: (ids: OverlayLayerId[]) => void;
  addDataset: (
    name: string,
    format: Dataset["format"],
    geojson: GeoJSONFeatureCollection,
    bounds?: [number, number, number, number],
    extra?: { communityId?: string; communityKind?: "trail" | "road" },
  ) => Dataset;
  removeDataset: (id: string) => void;
  toggleDataset: (id: string) => void;
  setDatasetVisible: (id: string, visible: boolean) => void;
  setActiveOnly: (id: string) => void;
  addWaypoint: (
    lat: number,
    lng: number,
    name?: string,
    notes?: string,
    extra?: { trackId?: string; photoUri?: string },
  ) => Waypoint;
  removeWaypoint: (id: string) => void;
  updateWaypoint: (id: string, patch: Partial<Waypoint>) => void;
  addRegion: (region: Omit<OfflineRegion, "id" | "createdAt">) => OfflineRegion;
  removeRegion: (id: string) => void;
  addTrack: (
    track: Omit<Track, "id" | "createdAt"> & { id?: string },
  ) => Track;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
};

const MapsContext = createContext<Ctx | null>(null);

function fireAndForget(p: Promise<unknown>): void {
  p.catch((err: unknown) => {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[sync]", err);
    }
  });
}

export function MapsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [active, setActive] = useState<ActiveState>({ datasetIds: [] });
  const [layers, setLayers] = useState<LayersState>({
    base: DEFAULT_BASE_LAYER,
    overlays: DEFAULT_OVERLAYS,
  });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">(
    "idle",
  );
  // Track the user id we last synced for so signing out / switching users
  // re-runs migration only once per user.
  const lastSyncedUserId = useRef<string | null>(null);

  // Refs mirror state so mutators can read the latest value synchronously
  // without race conditions with React's state updater scheduling.
  const waypointsRef = useRef(waypoints);
  const datasetsRef = useRef(datasets);
  const regionsRef = useRef(regions);
  const tracksRef = useRef(tracks);
  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);
  useEffect(() => {
    datasetsRef.current = datasets;
  }, [datasets]);
  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // While initial sign-in sync is in flight, record any local mutations
  // so we can merge them on top of the pulled cloud snapshot rather than
  // letting the wholesale replace clobber fresh edits.
  const syncingRef = useRef(false);
  const dirtyWaypoints = useRef(new Map<string, Waypoint | null>());
  const dirtyDatasets = useRef(new Map<string, Dataset | null>());
  const dirtyRegions = useRef(new Map<string, OfflineRegion | null>());
  const dirtyTracks = useRef(new Map<string, Track | null>());

  function recordDirty<T>(
    bag: Map<string, T | null>,
    id: string,
    value: T | null,
  ) {
    if (syncingRef.current) bag.set(id, value);
  }

  function mergeWithDirty<T extends { id: string }>(
    cloud: T[],
    dirty: Map<string, T | null>,
  ): T[] {
    if (dirty.size === 0) return cloud;
    const byId = new Map<string, T>();
    for (const item of cloud) byId.set(item.id, item);
    for (const [id, value] of dirty) {
      if (value === null) byId.delete(id);
      else byId.set(id, value);
    }
    return Array.from(byId.values());
  }

  /**
   * Preserve device-local-only fields on cloud waypoints by id (e.g.
   * `photoUri`, which is intentionally never synced). For waypoints that
   * exist on the device but not in the cloud yet, drop them — the
   * authoritative cloud pull is meant to replace local state, and any
   * still-pending creates will be applied via the dirty bag.
   */
  function preserveLocalWaypointFields(
    cloud: Waypoint[],
    local: Waypoint[],
  ): Waypoint[] {
    if (local.length === 0) return cloud;
    const localById = new Map(local.map((w) => [w.id, w]));
    return cloud.map((w) => {
      const l = localById.get(w.id);
      if (l?.photoUri && !w.photoUri) {
        return { ...w, photoUri: l.photoUri };
      }
      return w;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        const [d, w, r, tr, a, l, s] = await Promise.all([
          AsyncStorage.getItem(KEY_DATASETS),
          AsyncStorage.getItem(KEY_WAYPOINTS),
          AsyncStorage.getItem(KEY_REGIONS),
          AsyncStorage.getItem(KEY_TRACKS),
          AsyncStorage.getItem(KEY_ACTIVE),
          AsyncStorage.getItem(KEY_LAYERS),
          AsyncStorage.getItem(KEY_SETTINGS),
        ]);
        if (d) {
          const parsedDatasets = JSON.parse(d) as Dataset[];
          setDatasets(parsedDatasets.filter(isUsableSavedDataset));
        }
        if (w) setWaypoints(JSON.parse(w));
        if (r) setRegions(JSON.parse(r));
        if (tr) setTracks(JSON.parse(tr));
        if (a) setActive(JSON.parse(a));
        if (l) {
          const parsed = JSON.parse(l) as Partial<LayersState>;
          const base =
            parsed.base && BASE_LAYER_IDS.includes(parsed.base)
              ? parsed.base
              : DEFAULT_BASE_LAYER;
          const overlays = Array.isArray(parsed.overlays)
            ? parsed.overlays.filter((id): id is OverlayLayerId =>
                OVERLAY_LAYER_IDS.includes(id as OverlayLayerId),
              )
            : DEFAULT_OVERLAYS;
          setLayers({ base, overlays });
        }
        if (s) {
          const parsed = JSON.parse(s) as Partial<Settings>;
          setSettings({
            offRouteAlerts:
              typeof parsed.offRouteAlerts === "boolean"
                ? parsed.offRouteAlerts
                : DEFAULT_SETTINGS.offRouteAlerts,
            offRouteVoice:
              typeof parsed.offRouteVoice === "boolean"
                ? parsed.offRouteVoice
                : DEFAULT_SETTINGS.offRouteVoice,
            offRouteThreshold:
              typeof parsed.offRouteThreshold === "number" &&
              OFF_ROUTE_THRESHOLD_VALUES.includes(parsed.offRouteThreshold)
                ? parsed.offRouteThreshold
                : DEFAULT_SETTINGS.offRouteThreshold,
            units:
              parsed.units === "metric" || parsed.units === "imperial"
                ? parsed.units
                : DEFAULT_SETTINGS.units,
          });
        }
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_DATASETS, JSON.stringify(datasets));
  }, [datasets, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_WAYPOINTS, JSON.stringify(waypoints));
  }, [waypoints, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_REGIONS, JSON.stringify(regions));
  }, [regions, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_TRACKS, JSON.stringify(tracks));
  }, [tracks, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_ACTIVE, JSON.stringify(active));
  }, [active, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_LAYERS, JSON.stringify(layers));
  }, [layers, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  }, [settings, ready]);

  // Sync on sign-in: migrate local→cloud once per user, then pull cloud→local.
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      lastSyncedUserId.current = null;
      setSyncStatus("idle");
      return;
    }
    if (lastSyncedUserId.current === user.id) return;
    const userId = user.id;
    lastSyncedUserId.current = userId;
    const migratedKey = KEY_MIGRATED_PREFIX + userId;
    setSyncStatus("syncing");
    syncingRef.current = true;
    dirtyWaypoints.current.clear();
    dirtyDatasets.current.clear();
    dirtyRegions.current.clear();
    dirtyTracks.current.clear();
    (async () => {
      try {
        const migrated = await AsyncStorage.getItem(migratedKey);
        if (!migrated) {
          // First sign-in for this user: push everything currently on-device.
          await Promise.all([
            ...waypointsRef.current.map((w) => sync.pushWaypoint(w)),
            ...datasetsRef.current.map((d) => sync.pushDataset(d)),
            ...regionsRef.current.map((r) => sync.pushRegion(r)),
            ...tracksRef.current.map((t) => sync.pushTrack(t)),
          ]);
          await AsyncStorage.setItem(migratedKey, "1");
        }
        // Pull authoritative cloud state.
        const [
          cloudWaypoints,
          cloudDatasetSummaries,
          cloudRegions,
          cloudTrackSummaries,
        ] = await Promise.all([
          sync.pullWaypoints(),
          sync.pullDatasetSummaries(),
          sync.pullRegions(),
          sync.pullTrackSummaries(),
        ]);
        const cloudDatasets = await Promise.all(
          cloudDatasetSummaries.map((s) => sync.pullDatasetDetail(s.id)),
        );
        const cloudTracks = await Promise.all(
          cloudTrackSummaries.map((s) => sync.pullTrackDetail(s.id)),
        );
        // Merge: cloud as base, local mutations made during sync win.
        // Also preserve device-local fields like photoUri that are never
        // synced to the cloud.
        const cloudWaypointsWithLocalFields = preserveLocalWaypointFields(
          cloudWaypoints,
          waypointsRef.current,
        );
        setWaypoints(
          mergeWithDirty(cloudWaypointsWithLocalFields, dirtyWaypoints.current),
        );
        setDatasets(
          mergeWithDirty(cloudDatasets, dirtyDatasets.current).filter(
            isUsableSavedDataset,
          ),
        );
        setRegions(mergeWithDirty(cloudRegions, dirtyRegions.current));
        setTracks(mergeWithDirty(cloudTracks, dirtyTracks.current));
        setSyncStatus("idle");
      } catch (err) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[sync] initial sync failed", err);
        }
        // Allow another attempt: signing out + back in retries; or a future
        // explicit retry button can flip this without a full re-auth.
        lastSyncedUserId.current = null;
        setSyncStatus("error");
      } finally {
        syncingRef.current = false;
        dirtyWaypoints.current.clear();
        dirtyDatasets.current.clear();
        dirtyRegions.current.clear();
        dirtyTracks.current.clear();
      }
    })();
  }, [user, ready]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const setBaseLayer = useCallback((id: BaseLayerId) => {
    setLayers((prev) => ({ ...prev, base: id }));
  }, []);

  const toggleOverlay = useCallback((id: OverlayLayerId) => {
    setLayers((prev) => ({
      ...prev,
      overlays: prev.overlays.includes(id)
        ? prev.overlays.filter((x) => x !== id)
        : [...prev.overlays, id],
    }));
  }, []);

  const setOverlays = useCallback((ids: OverlayLayerId[]) => {
    setLayers((prev) => ({ ...prev, overlays: ids }));
  }, []);

  const isAuthed = !!user;

  const addDataset = useCallback<Ctx["addDataset"]>(
    (name, format, geojson, bounds, extra) => {
      const id = genId();
      const palette =
        extra?.communityKind === "road" ? ROAD_COLORS : DATASET_COLORS;
      const color = palette[Math.floor(Math.random() * palette.length)];
      const ds: Dataset = {
        id,
        name,
        format,
        geojson,
        color,
        visible: true,
        importedAt: Date.now(),
        bounds,
        communityId: extra?.communityId,
        communityKind: extra?.communityKind,
      };
      setDatasets((prev) => [ds, ...prev]);
      setActive((prev) => ({ datasetIds: [id, ...prev.datasetIds] }));
      if (isAuthed) {
        recordDirty(dirtyDatasets.current, id, ds);
        fireAndForget(sync.pushDataset(ds));
      }
      return ds;
    },
    [isAuthed],
  );

  const removeDataset = useCallback(
    (id: string) => {
      setDatasets((prev) => prev.filter((d) => d.id !== id));
      setActive((prev) => ({
        datasetIds: prev.datasetIds.filter((x) => x !== id),
      }));
      if (isAuthed) {
        recordDirty(dirtyDatasets.current, id, null);
        fireAndForget(sync.deleteDataset(id));
      }
    },
    [isAuthed],
  );

  const toggleDataset = useCallback(
    (id: string) => {
      const cur = datasetsRef.current.find((d) => d.id === id);
      if (!cur) return;
      const updated: Dataset = { ...cur, visible: !cur.visible };
      setDatasets((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (isAuthed) {
        recordDirty(dirtyDatasets.current, id, updated);
        fireAndForget(sync.pushDataset(updated));
      }
    },
    [isAuthed],
  );

  const setDatasetVisible = useCallback(
    (id: string, visible: boolean) => {
      const cur = datasetsRef.current.find((d) => d.id === id);
      if (!cur) return;
      const updated: Dataset = { ...cur, visible };
      setDatasets((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (isAuthed) {
        recordDirty(dirtyDatasets.current, id, updated);
        fireAndForget(sync.pushDataset(updated));
      }
    },
    [isAuthed],
  );

  const setActiveOnly = useCallback(
    (id: string) => {
      setActive({ datasetIds: [id] });
      const cur = datasetsRef.current.find((d) => d.id === id);
      if (!cur) return;
      const updated: Dataset = { ...cur, visible: true };
      setDatasets((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (isAuthed) {
        recordDirty(dirtyDatasets.current, id, updated);
        fireAndForget(sync.pushDataset(updated));
      }
    },
    [isAuthed],
  );

  const addWaypoint = useCallback<Ctx["addWaypoint"]>(
    (lat, lng, name, notes, extra) => {
      const wp: Waypoint = {
        id: genId(),
        name: name ?? `Waypoint ${new Date().toLocaleTimeString()}`,
        latitude: lat,
        longitude: lng,
        notes,
        createdAt: Date.now(),
        trackId: extra?.trackId,
        photoUri: extra?.photoUri,
      };
      setWaypoints((prev) => [wp, ...prev]);
      if (isAuthed) {
        recordDirty(dirtyWaypoints.current, wp.id, wp);
        fireAndForget(sync.pushWaypoint(wp));
      }
      return wp;
    },
    [isAuthed],
  );

  const removeWaypoint = useCallback(
    (id: string) => {
      const cur = waypointsRef.current.find((w) => w.id === id);
      if (cur?.photoUri) {
        fireAndForget(removePhoto(cur.photoUri));
      }
      setWaypoints((prev) => prev.filter((w) => w.id !== id));
      if (isAuthed) {
        recordDirty(dirtyWaypoints.current, id, null);
        fireAndForget(sync.deleteWaypoint(id));
      }
    },
    [isAuthed],
  );

  const updateWaypoint = useCallback(
    (id: string, patch: Partial<Waypoint>) => {
      const cur = waypointsRef.current.find((w) => w.id === id);
      if (!cur) return;
      const updated: Waypoint = { ...cur, ...patch };
      setWaypoints((prev) => prev.map((w) => (w.id === id ? updated : w)));
      if (isAuthed) {
        recordDirty(dirtyWaypoints.current, id, updated);
        fireAndForget(sync.pushWaypoint(updated));
      }
    },
    [isAuthed],
  );

  const addRegion = useCallback<Ctx["addRegion"]>(
    (region) => {
      const r: OfflineRegion = {
        ...region,
        id: genId(),
        createdAt: Date.now(),
      };
      setRegions((prev) => [r, ...prev]);
      if (isAuthed) {
        recordDirty(dirtyRegions.current, r.id, r);
        fireAndForget(sync.pushRegion(r));
      }
      return r;
    },
    [isAuthed],
  );

  const removeRegion = useCallback(
    (id: string) => {
      setRegions((prev) => prev.filter((r) => r.id !== id));
      if (isAuthed) {
        recordDirty(dirtyRegions.current, id, null);
        fireAndForget(sync.deleteRegion(id));
      }
    },
    [isAuthed],
  );

  const addTrack = useCallback<Ctx["addTrack"]>(
    (track) => {
      const { id: providedId, ...rest } = track;
      const t: Track = {
        ...rest,
        id: providedId ?? genId(),
        createdAt: Date.now(),
      };
      setTracks((prev) => [t, ...prev]);
      if (isAuthed) {
        recordDirty(dirtyTracks.current, t.id, t);
        fireAndForget(sync.pushTrack(t));
      }
      return t;
    },
    [isAuthed],
  );

  const updateTrack = useCallback<Ctx["updateTrack"]>(
    (id, patch) => {
      const cur = tracksRef.current.find((t) => t.id === id);
      if (!cur) return;
      const updated: Track = { ...cur, ...patch };
      setTracks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (isAuthed) {
        recordDirty(dirtyTracks.current, id, updated);
        fireAndForget(sync.pushTrack(updated));
      }
    },
    [isAuthed],
  );

  const removeTrack = useCallback(
    (id: string) => {
      setTracks((prev) => prev.filter((t) => t.id !== id));
      if (isAuthed) {
        recordDirty(dirtyTracks.current, id, null);
        fireAndForget(sync.deleteTrack(id));
      }
    },
    [isAuthed],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      datasets,
      waypoints,
      regions,
      tracks,
      active,
      layers,
      settings,
      syncStatus,
      updateSettings,
      setBaseLayer,
      toggleOverlay,
      setOverlays,
      addDataset,
      removeDataset,
      toggleDataset,
      setDatasetVisible,
      setActiveOnly,
      addWaypoint,
      removeWaypoint,
      updateWaypoint,
      addRegion,
      removeRegion,
      addTrack,
      updateTrack,
      removeTrack,
    }),
    [
      ready,
      datasets,
      waypoints,
      regions,
      tracks,
      active,
      layers,
      settings,
      syncStatus,
      updateSettings,
      setBaseLayer,
      toggleOverlay,
      setOverlays,
      addDataset,
      removeDataset,
      toggleDataset,
      setDatasetVisible,
      setActiveOnly,
      addWaypoint,
      removeWaypoint,
      updateWaypoint,
      addRegion,
      removeRegion,
      addTrack,
      updateTrack,
      removeTrack,
    ],
  );

  return <MapsContext.Provider value={value}>{children}</MapsContext.Provider>;
}

export function useMaps(): Ctx {
  const ctx = useContext(MapsContext);
  if (!ctx) throw new Error("useMaps must be used inside MapsProvider");
  return ctx;
}
