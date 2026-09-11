import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import {
  startRecording,
  trackDistanceMeters,
  trackDurationMs,
  type RecordingHandle,
} from "@/lib/trackRecording";
import { genId, type Track, type TrackPoint, type Waypoint } from "@/lib/types";
import {
  createLiveSession,
  enqueueLiveMessage,
  enqueueLivePoint,
  enqueueLiveWaypoint,
  loadLiveSession,
  saveLiveSession,
  syncLiveSession,
  type LiveSession,
} from "@/lib/liveSharing";
import { mergeLiveSyncResult } from "@/lib/liveSyncMerge";

import { useMaps } from "./MapsContext";

type Ctx = {
  isRecording: boolean;
  /** Pre-allocated id for the in-progress recording, so waypoints dropped
   *  while recording can reference the eventual track before it's saved. */
  recordingTrackId: string | null;
  livePoints: TrackPoint[];
  liveDistanceMeters: number;
  liveDurationMs: number;
  liveActivity: LiveSession | null;
  startLiveShare: (input: {
    name: string;
    ownerDisplayName: string;
    followedRoute: LiveSession["followedRoute"];
  }) => Promise<LiveSession>;
  endLiveShare: () => Promise<void>;
  revokeLiveShare: () => Promise<void>;
  sendLiveReply: (message: string) => Promise<void>;
  shareLiveWaypoint: (waypoint: Waypoint) => void;
  refreshLiveShare: () => Promise<void>;
  start: () => Promise<void>;
  stop: (name?: string) => Promise<Track | null>;
  cancel: () => Promise<void>;
};

const RecordingContext = createContext<Ctx | null>(null);

const TRACK_COLOR = "#c8633a";

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const { addTrack } = useMaps();
  const handleRef = useRef<RecordingHandle | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null);
  // Mirror of recordingTrackId so async callbacks (start/stop) read the
  // current value without depending on stale closures.
  const recordingTrackIdRef = useRef<string | null>(null);
  useEffect(() => {
    recordingTrackIdRef.current = recordingTrackId;
  }, [recordingTrackId]);
  const [livePoints, setLivePoints] = useState<TrackPoint[]>([]);
  const [liveActivity, setLiveActivity] = useState<LiveSession | null>(null);
  const liveActivityRef = useRef<LiveSession | null>(null);
  const syncingLiveRef = useRef(false);
  const livePersistQueueRef = useRef(Promise.resolve());

  const persistLiveActivity = useCallback((next: LiveSession | null) => {
    liveActivityRef.current = next;
    setLiveActivity(next);
    // AsyncStorage writes must preserve mutation order too: a slower earlier
    // write must never put an old queue back after a newer state is committed.
    livePersistQueueRef.current = livePersistQueueRef.current
      .catch(() => undefined)
      .then(() => saveLiveSession(next));
  }, []);

  useEffect(() => {
    void loadLiveSession().then((saved) => {
      // A user can start sharing before slow storage hydration finishes. Do
      // not let an older persisted session replace that fresh activity.
      if (saved && !liveActivityRef.current) {
        persistLiveActivity(saved);
        // The viewer URL is deliberately memory-only. Refresh it immediately
        // after hydration so copy/share is ready without waiting for the timer.
        void syncLiveSession(saved).then((synced) => {
          if (liveActivityRef.current?.id !== saved.id) return;
          persistLiveActivity(
            mergeLiveSyncResult(saved, synced, liveActivityRef.current),
          );
        });
      }
    });
  }, [persistLiveActivity]);

  const refreshLiveShare = useCallback(async () => {
    const current = liveActivityRef.current;
    if (!current || syncingLiveRef.current) return;
    syncingLiveRef.current = true;
    try {
      const next = await syncLiveSession(current);
      persistLiveActivity(mergeLiveSyncResult(current, next, liveActivityRef.current));
    } finally {
      syncingLiveRef.current = false;
    }
  }, [persistLiveActivity]);

  // Location and messages remain durable on the device. Retrying on a short
  // timer and whenever the app returns foreground catches up after coverage
  // resumes without turning the recording itself into a network dependency.
  useEffect(() => {
    const id = setInterval(() => void refreshLiveShare(), 12_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshLiveShare();
    });
    return () => {
      clearInterval(id);
      subscription.remove();
    };
  }, [refreshLiveShare]);

  const startLiveShare = useCallback(
    async (input: {
      name: string;
      ownerDisplayName: string;
      followedRoute: LiveSession["followedRoute"];
    }) => {
      const existing = liveActivityRef.current;
      if (existing?.status === "active" && !existing.pendingRevoke) {
        throw new Error("This recording is already sharing a live activity.");
      }
      const session = await createLiveSession(input);
      persistLiveActivity(session);
      return session;
    },
    [persistLiveActivity],
  );

  const endLiveShare = useCallback(async () => {
    const current = liveActivityRef.current;
    if (!current || current.status !== "active") return;
    persistLiveActivity({ ...current, pendingEnd: true });
    await refreshLiveShare();
  }, [persistLiveActivity, refreshLiveShare]);

  const revokeLiveShare = useCallback(async () => {
    const current = liveActivityRef.current;
    if (!current) return;
    persistLiveActivity({ ...current, pendingRevoke: true });
    await refreshLiveShare();
  }, [persistLiveActivity, refreshLiveShare]);

  const sendLiveReply = useCallback(
    async (message: string) => {
      const current = liveActivityRef.current;
      const body = message.trim();
      if (!current || current.status !== "active" || !body) return;
      persistLiveActivity(enqueueLiveMessage(current, body.slice(0, 280)));
      await refreshLiveShare();
    },
    [persistLiveActivity, refreshLiveShare],
  );

  const shareLiveWaypoint = useCallback(
    (waypoint: Waypoint) => {
      const current = liveActivityRef.current;
      if (!current || current.status !== "active" || current.pendingEnd) return;
      persistLiveActivity(enqueueLiveWaypoint(current, waypoint));
      void refreshLiveShare();
    },
    [persistLiveActivity, refreshLiveShare],
  );
  // Tick to refresh duration display while recording.
  const [, setNow] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  const start = useCallback(async () => {
    if (handleRef.current) return;
    setLivePoints([]);
    const newId = genId();
    recordingTrackIdRef.current = newId;
    setRecordingTrackId(newId);
    const h = await startRecording({
      onPoint: (p) => {
        setLivePoints((prev) => [...prev, p]);
        const activity = liveActivityRef.current;
        if (activity?.status === "active" && !activity.pendingEnd) {
          persistLiveActivity(enqueueLivePoint(activity, p));
          void refreshLiveShare();
        }
      },
    });
    handleRef.current = h;
    setIsRecording(true);
  }, []);

  const stop = useCallback(
    async (name?: string): Promise<Track | null> => {
      const h = handleRef.current;
      if (!h) return null;
      handleRef.current = null;
      const points = await h.stop();
      // Mark the link completed after the last locally captured point has been
      // queued. If offline, the persisted queue ends it on a later retry.
      await endLiveShare();
      const preallocatedId = recordingTrackIdRef.current;
      setIsRecording(false);
      if (points.length < 2) {
        setLivePoints([]);
        recordingTrackIdRef.current = null;
        setRecordingTrackId(null);
        return null;
      }
      const startedAt = points[0].t;
      const endedAt = points[points.length - 1].t;
      const distanceMeters = trackDistanceMeters(points);
      const durationMs = trackDurationMs(points);
      const trackName =
        name?.trim() ||
        `Track ${new Date(startedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`;
      const t = addTrack({
        ...(preallocatedId ? { id: preallocatedId } : {}),
        name: trackName,
        color: TRACK_COLOR,
        points,
        distanceMeters,
        durationMs,
        pointCount: points.length,
        startedAt,
        endedAt,
      });
      setLivePoints([]);
      recordingTrackIdRef.current = null;
      setRecordingTrackId(null);
      return t;
    },
    [addTrack, endLiveShare],
  );

  const cancel = useCallback(async () => {
    const h = handleRef.current;
    handleRef.current = null;
    if (h) await h.stop();
    await revokeLiveShare();
    setIsRecording(false);
    setLivePoints([]);
    recordingTrackIdRef.current = null;
    setRecordingTrackId(null);
  }, [revokeLiveShare]);

  const value = useMemo<Ctx>(() => {
    const liveDistanceMeters = trackDistanceMeters(livePoints);
    const liveDurationMs =
      livePoints.length >= 2
        ? Math.max(0, Date.now() - livePoints[0].t)
        : 0;
    return {
      isRecording,
      recordingTrackId,
      livePoints,
      liveDistanceMeters,
      liveDurationMs,
      liveActivity,
      startLiveShare,
      endLiveShare,
      revokeLiveShare,
      sendLiveReply,
      shareLiveWaypoint,
      refreshLiveShare,
      start,
      stop,
      cancel,
    };
  }, [
    isRecording,
    recordingTrackId,
    livePoints,
    liveActivity,
    startLiveShare,
    endLiveShare,
    revokeLiveShare,
    sendLiveReply,
    shareLiveWaypoint,
    refreshLiveShare,
    start,
    stop,
    cancel,
  ]);

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording(): Ctx {
  const ctx = useContext(RecordingContext);
  if (!ctx)
    throw new Error("useRecording must be used inside RecordingProvider");
  return ctx;
}
