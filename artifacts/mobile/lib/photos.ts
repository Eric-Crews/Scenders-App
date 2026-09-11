import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { genId } from "./types";

const PHOTOS_DIR =
  Platform.OS === "web"
    ? null
    : (FileSystem.documentDirectory ?? "") + "photos/";

async function ensureDir(): Promise<string> {
  if (!PHOTOS_DIR) throw new Error("Photos are not supported on web.");
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
  return PHOTOS_DIR;
}

/** Copy a picked/captured image into our durable photos dir and return its file:// URI. */
async function persistPickedImage(sourceUri: string): Promise<string> {
  const dir = await ensureDir();
  const ext = sourceUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
  const dest = `${dir}${genId()}.${safeExt}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

/**
 * Best-effort save of an image URI to the device's Camera Roll.
 *
 * Uses a lazy require so that a missing or version-mismatched native module
 * (e.g. running under an older Expo Go build) never crashes startup — it just
 * silently skips the save. The photo is always preserved inside the app.
 */
async function saveToDeviceLibrary(uri: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MediaLibrary = require("expo-media-library") as typeof import("expo-media-library");
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== "granted") return;
    await MediaLibrary.saveToLibraryAsync(uri);
  } catch {
    // Best-effort — never block the waypoint flow.
  }
}

/** Open the camera. Returns a durable file:// URI, or null if cancelled.
 *  Also saves the captured photo to the device's Camera Roll. */
export async function takePhoto(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Camera permission denied");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  const capturedUri = result.assets[0].uri;
  // Fire-and-forget — never await so the waypoint sheet appears instantly.
  void saveToDeviceLibrary(capturedUri);
  return persistPickedImage(capturedUri);
}

/** Pick a photo from the library. Returns a durable file:// URI, or null if cancelled.
 *  No camera-roll save needed — the photo already lives on the device. */
export async function pickPhoto(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library permission denied");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    exif: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return persistPickedImage(result.assets[0].uri);
}

/** Best-effort delete of a stored photo. Safe to call with stale URIs. */
export async function removePhoto(uri: string | undefined): Promise<void> {
  if (!uri || Platform.OS === "web") return;
  if (!PHOTOS_DIR || !uri.startsWith(PHOTOS_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}
