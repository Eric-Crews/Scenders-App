import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as TaskManager from "expo-task-manager";
import { AppState, Platform } from "react-native";

import { routeProgress, type LatLng } from "./geo";

/**
 * Keeps off-route haptic/voice alerts firing while the phone is pocketed or the
 * screen is locked during an active follow. The whole point of field navigation
 * is leaving the phone away — the foreground location watcher freezes when the
 * app is backgrounded, so this module drives a `TaskManager` background-location
 * task that re-runs the off-route detection independently of the React tree.
 */

export const BACKGROUND_FOLLOW_TASK = "mapper-one-background-follow";

// Active follow config the background task reads on every location update. It
// can't see React state, so the screen mirrors the current route/threshold/
// toggles here whenever they change.
const KEY_FOLLOW_CONFIG = "fieldmaps.follow.config.v1";
// Shared off-route latch so the foreground effect and the background task never
// double-announce the same crossing — whichever runs reads and updates this.
const KEY_FOLLOW_STATE = "fieldmaps.follow.state.v1";

// Hysteresis ratio: must come back within this fraction of the chosen off-route
// threshold before we announce recovery. Prevents repeated buzzing while
// hovering right on the boundary (e.g. a 50 m threshold recovers at 35 m).
export const BACK_ON_RATIO = 0.7;

export type FollowConfig = {
  route: LatLng[];
  threshold: number;
  alerts: boolean;
  voice: boolean;
};

type FollowState = {
  /** Whether we last considered the user physically off-route. */
  wasOffRoute: boolean;
};

async function readConfig(): Promise<FollowConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FOLLOW_CONFIG);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FollowConfig>;
    if (!Array.isArray(parsed.route) || parsed.route.length < 2) return null;
    return {
      route: parsed.route as LatLng[],
      threshold:
        typeof parsed.threshold === "number" ? parsed.threshold : 50,
      alerts: parsed.alerts !== false,
      voice: parsed.voice === true,
    };
  } catch {
    return null;
  }
}

export async function setFollowConfig(config: FollowConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_FOLLOW_CONFIG, JSON.stringify(config));
  } catch {
    // Best-effort: if persistence fails the background task simply no-ops.
  }
}

export async function clearFollowConfig(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_FOLLOW_CONFIG);
  } catch {
    // ignore
  }
}

export async function readFollowState(): Promise<FollowState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FOLLOW_STATE);
    if (!raw) return { wasOffRoute: false };
    const parsed = JSON.parse(raw) as Partial<FollowState>;
    return { wasOffRoute: parsed.wasOffRoute === true };
  } catch {
    return { wasOffRoute: false };
  }
}

export async function writeFollowState(state: FollowState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_FOLLOW_STATE, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Fire a haptic buzz (and optional spoken cue) for an off-route crossing. */
export function announceOffRoute(isOff: boolean, voice: boolean): void {
  if (Platform.OS !== "web") {
    Haptics.notificationAsync(
      isOff
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }
  if (voice) {
    try {
      Speech.stop();
      Speech.speak(isOff ? "Off route" : "Back on route");
    } catch {
      // TTS is best-effort; ignore failures.
    }
  }
}

/**
 * Evaluate one location fix against the persisted follow config and fire the
 * off-route / back-on-route alert when a threshold crossing happens. Uses the
 * shared persisted latch (with hysteresis) so it stays consistent whether it's
 * called from the foreground effect or the background task.
 */
export async function evaluateOffRoute(loc: LatLng): Promise<void> {
  const config = await readConfig();
  if (!config) return;
  const prog = routeProgress(config.route, loc);
  if (!prog) return;
  const off = prog.offRouteMeters;
  const state = await readFollowState();
  let wasOff = state.wasOffRoute;
  if (!wasOff && off > config.threshold) {
    wasOff = true;
    if (config.alerts) announceOffRoute(true, config.voice);
  } else if (wasOff && off < config.threshold * BACK_ON_RATIO) {
    wasOff = false;
    if (config.alerts) announceOffRoute(false, config.voice);
  }
  if (wasOff !== state.wasOffRoute) await writeFollowState({ wasOffRoute: wasOff });
}

// Register the background-location task at module scope (required by
// TaskManager). Guard web, where expo-task-manager isn't supported.
if (Platform.OS !== "web") {
  TaskManager.defineTask(BACKGROUND_FOLLOW_TASK, async ({ data, error }) => {
    if (error) return;
    // When the app is foregrounded the on-screen effect owns alerting, so skip
    // here to avoid double-announcing the same crossing.
    if (AppState.currentState === "active") return;
    const { locations } = (data ?? {}) as {
      locations?: Location.LocationObject[];
    };
    const last = locations?.[locations.length - 1];
    if (!last) return;
    await evaluateOffRoute({
      lat: last.coords.latitude,
      lng: last.coords.longitude,
    });
  });
}

/**
 * Ask for "Always" location access so the OS keeps delivering fixes with the
 * app backgrounded. Returns whether background access was granted. Foreground
 * permission is assumed to already be granted by the live-tracking watcher.
 */
export async function requestBackgroundFollowPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

let starting = false;

/**
 * Begin background location updates feeding the off-route task. Idempotent and
 * battery-conscious: callers only invoke this while actively following a route.
 * Returns true if background updates are running after the call.
 */
export async function startBackgroundFollow(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (starting) return false;
  starting = true;
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_FOLLOW_TASK,
    ).catch(() => false);
    if (already) return true;
    await Location.startLocationUpdatesAsync(BACKGROUND_FOLLOW_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      timeInterval: 5000,
      // Keep delivering with the screen off / app backgrounded.
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "mapper.one is guiding you",
        notificationBody: "Off-route alerts stay on with your screen locked.",
        notificationColor: "#2f6b46",
      },
    });
    return true;
  } catch {
    // Background updates aren't available (e.g. Expo Go, or permission denied).
    // Foreground alerts still work while the app is open.
    return false;
  } finally {
    starting = false;
  }
}

/** Stop background location updates. Safe to call when not running. */
export async function stopBackgroundFollow(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_FOLLOW_TASK,
    ).catch(() => false);
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_FOLLOW_TASK);
    }
  } catch {
    // ignore
  }
}
