import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { ALL_LAYERS, type LayerConfig, resolveTileUrl } from "./mapLayers";

const IS_WEB = Platform.OS === "web";
const TILE_DIR = IS_WEB
  ? ""
  : (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "") +
    "tiles/";

export type TileCoord = { z: number; x: number; y: number };

export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

export function tilesForBounds(
  bounds: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): TileCoord[] {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const tiles: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lon2tile(minLng, z);
    const xMax = lon2tile(maxLng, z);
    const yMin = lat2tile(maxLat, z);
    const yMax = lat2tile(minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

async function ensureDir(): Promise<void> {
  if (IS_WEB) return;
  const info = await FileSystem.getInfoAsync(TILE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TILE_DIR, { intermediates: true });
  }
}

function tilePath(layerId: string, t: TileCoord): string {
  return `${TILE_DIR}${layerId}__${t.z}_${t.x}_${t.y}.png`;
}

function tileKey(t: TileCoord): string {
  return `${t.z}/${t.x}/${t.y}`;
}

const memoryCache: Record<string, Record<string, string>> = {};

function memBucket(layerId: string): Record<string, string> {
  if (!memoryCache[layerId]) memoryCache[layerId] = {};
  return memoryCache[layerId];
}

async function fetchTileBase64Web(
  config: LayerConfig,
  t: TileCoord,
): Promise<string> {
  const res = await fetch(resolveTileUrl(config, t.z, t.x, t.y));
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function downloadTile(
  layerId: string,
  t: TileCoord,
): Promise<string> {
  const config = ALL_LAYERS[layerId];
  if (!config) throw new Error(`Unknown layer: ${layerId}`);
  if (IS_WEB) {
    const bucket = memBucket(layerId);
    const key = tileKey(t);
    if (bucket[key]) return bucket[key];
    const dataUrl = await fetchTileBase64Web(config, t);
    bucket[key] = dataUrl;
    return dataUrl;
  }
  await ensureDir();
  const dest = tilePath(layerId, t);
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;
  const result = await FileSystem.downloadAsync(
    resolveTileUrl(config, t.z, t.x, t.y),
    dest,
    {
      headers: { "User-Agent": "ScendersRide/1.0 (+https://scenders.com)" },
    },
  );
  return result.uri;
}

// Tiles are written to disk with a .png filename regardless of their real
// format (OSM/Topo/CyclOSM/Waymarked are PNG, but Esri imagery/hillshade are
// JPEG). WKWebView can refuse to decode a JPEG served under a data:image/png
// URL, so sniff the actual format from the base64 magic bytes. JPEG base64
// starts with "/9j/" (FF D8 FF), PNG with "iVBORw0KGgo" (89 50 4E 47).
function dataUrlFor(base64: string): string {
  const mime = base64.startsWith("/9j/") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${base64}`;
}

export async function readTileBase64(
  layerId: string,
  t: TileCoord,
): Promise<string | null> {
  if (IS_WEB) {
    return memBucket(layerId)[tileKey(t)] ?? null;
  }
  const dest = tilePath(layerId, t);
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) return null;
  const data = await FileSystem.readAsStringAsync(dest, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dataUrlFor(data);
}

export type DownloadProgress = {
  total: number;
  done: number;
  failed: number;
};

export async function downloadTilesForLayers(
  tiles: TileCoord[],
  layerIds: string[],
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadProgress> {
  await ensureDir();
  const jobs: { layerId: string; tile: TileCoord }[] = [];
  for (const layerId of layerIds) {
    const config = ALL_LAYERS[layerId];
    if (!config) continue;
    for (const t of tiles) {
      // Skip tiles past this layer's max zoom (e.g. OpenTopoMap caps at 17).
      if (t.z > config.maxZoom) continue;
      jobs.push({ layerId, tile: t });
    }
  }
  let done = 0;
  let failed = 0;
  const concurrency = 4;
  let index = 0;
  async function worker(): Promise<void> {
    while (index < jobs.length) {
      const i = index++;
      const job = jobs[i];
      try {
        await downloadTile(job.layerId, job.tile);
        done++;
      } catch {
        failed++;
      }
      onProgress?.({ total: jobs.length, done, failed });
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return { total: jobs.length, done, failed };
}

export async function listCachedTiles(): Promise<
  { layerId: string; tile: TileCoord }[]
> {
  if (IS_WEB) {
    const out: { layerId: string; tile: TileCoord }[] = [];
    Object.keys(memoryCache).forEach((layerId) => {
      Object.keys(memoryCache[layerId]).forEach((k) => {
        const [z, x, y] = k.split("/").map(Number);
        out.push({ layerId, tile: { z, x, y } });
      });
    });
    return out;
  }
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(TILE_DIR);
  const out: { layerId: string; tile: TileCoord }[] = [];
  for (const f of files) {
    const m = f.match(/^(.+)__(\d+)_(\d+)_(\d+)\.png$/);
    if (m) {
      out.push({
        layerId: m[1],
        tile: { z: Number(m[2]), x: Number(m[3]), y: Number(m[4]) },
      });
    }
  }
  return out;
}

export async function clearTileCache(): Promise<void> {
  if (IS_WEB) {
    Object.keys(memoryCache).forEach((k) => delete memoryCache[k]);
    return;
  }
  const info = await FileSystem.getInfoAsync(TILE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(TILE_DIR, { idempotent: true });
  }
}

/**
 * Returns a per-layer manifest of all cached tiles as base64 data URLs,
 * suitable for injection into the Leaflet WebView.
 */
export async function buildOfflineManifest(): Promise<
  Record<string, Record<string, string>>
> {
  const entries = await listCachedTiles();
  const out: Record<string, Record<string, string>> = {};
  for (const { layerId, tile } of entries) {
    const data = await readTileBase64(layerId, tile);
    if (data) {
      if (!out[layerId]) out[layerId] = {};
      out[layerId][`${tile.z}/${tile.x}/${tile.y}`] = data;
    }
  }
  return out;
}

export async function tileCacheSize(): Promise<{
  count: number;
  bytes: number;
  byLayer: Record<string, { count: number; bytes: number }>;
}> {
  const byLayer: Record<string, { count: number; bytes: number }> = {};
  if (IS_WEB) {
    let count = 0;
    let bytes = 0;
    Object.keys(memoryCache).forEach((layerId) => {
      const bucket = memoryCache[layerId];
      const keys = Object.keys(bucket);
      let lb = 0;
      keys.forEach((k) => {
        lb += Math.floor((bucket[k].length * 3) / 4);
      });
      byLayer[layerId] = { count: keys.length, bytes: lb };
      count += keys.length;
      bytes += lb;
    });
    return { count, bytes, byLayer };
  }
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(TILE_DIR);
  let bytes = 0;
  let count = 0;
  for (const f of files) {
    const m = f.match(/^(.+)__(\d+)_(\d+)_(\d+)\.png$/);
    if (!m) continue;
    const layerId = m[1];
    const info = await FileSystem.getInfoAsync(TILE_DIR + f);
    const size =
      info.exists && "size" in info && typeof info.size === "number"
        ? info.size
        : 0;
    bytes += size;
    count += 1;
    if (!byLayer[layerId]) byLayer[layerId] = { count: 0, bytes: 0 };
    byLayer[layerId].count += 1;
    byLayer[layerId].bytes += size;
  }
  return { count, bytes, byLayer };
}
