import toGeoJSON from "@mapbox/togeojson";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONGeometry,
} from "./types";

function isFeatureCollection(input: unknown): input is GeoJSONFeatureCollection {
  return (
    !!input &&
    typeof input === "object" &&
    (input as { type?: string }).type === "FeatureCollection" &&
    Array.isArray((input as { features?: unknown[] }).features)
  );
}

export function parseGeoJSON(text: string): GeoJSONFeatureCollection {
  const parsed: unknown = JSON.parse(text);
  if (isFeatureCollection(parsed)) {
    return parsed;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as { type?: string }).type === "Feature"
  ) {
    return {
      type: "FeatureCollection",
      features: [parsed as GeoJSONFeature],
    };
  }
  throw new Error("Unsupported GeoJSON structure");
}

export function parseKML(text: string): GeoJSONFeatureCollection {
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const fc = toGeoJSON.kml(xml) as GeoJSONFeatureCollection;
  return fc;
}

export function parseGPX(text: string): GeoJSONFeatureCollection {
  const xml = new DOMParser().parseFromString(text, "text/xml");
  const fc = toGeoJSON.gpx(xml) as GeoJSONFeatureCollection;
  return fc;
}

export type DatasetFormat = "geojson" | "kml" | "gpx" | "kmz";

export function detectFormat(name: string): DatasetFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) return "geojson";
  if (lower.endsWith(".kml")) return "kml";
  if (lower.endsWith(".gpx")) return "gpx";
  if (lower.endsWith(".kmz")) return "kmz";
  return null;
}

export async function parseKMZ(
  base64: string,
): Promise<GeoJSONFeatureCollection> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  let kmlEntry = zip.file("doc.kml");
  if (!kmlEntry) {
    const candidates = Object.keys(zip.files).filter((n) =>
      n.toLowerCase().endsWith(".kml"),
    );
    if (candidates.length === 0) {
      throw new Error("KMZ archive contained no .kml file");
    }
    kmlEntry = zip.file(candidates[0]);
  }
  if (!kmlEntry) throw new Error("Could not read KML from KMZ");
  const text = await kmlEntry.async("string");
  return parseKML(text);
}

function eachCoord(
  geom: GeoJSONGeometry | null,
  cb: (lng: number, lat: number) => void,
): void {
  if (!geom) return;
  switch (geom.type) {
    case "Point":
      cb(geom.coordinates[0], geom.coordinates[1]);
      return;
    case "MultiPoint":
    case "LineString":
      geom.coordinates.forEach((c) => cb(c[0], c[1]));
      return;
    case "MultiLineString":
    case "Polygon":
      geom.coordinates.forEach((ring) =>
        ring.forEach((c) => cb(c[0], c[1])),
      );
      return;
    case "MultiPolygon":
      geom.coordinates.forEach((poly) =>
        poly.forEach((ring) => ring.forEach((c) => cb(c[0], c[1]))),
      );
      return;
  }
}

export function computeBounds(
  fc: GeoJSONFeatureCollection,
): [number, number, number, number] | undefined {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let count = 0;
  for (const f of fc.features) {
    eachCoord(f.geometry, (lng, lat) => {
      count++;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  }
  if (count === 0) return undefined;
  return [minLng, minLat, maxLng, maxLat];
}

export function countFeatures(fc: GeoJSONFeatureCollection): number {
  return fc.features.length;
}
