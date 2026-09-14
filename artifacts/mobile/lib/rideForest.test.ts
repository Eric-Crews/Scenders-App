import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRideGuide, normalizeTrack } from "./rideForest";

const line = [[-82.55, 35.58, 650], [-82.54, 35.59, 675]];

test("normalizes point arrays and GeoJSON route geometry", () => {
  assert.deepEqual(normalizeTrack(line), [
    { lat: 35.58, lng: -82.55, ele: 650 },
    { lat: 35.59, lng: -82.54, ele: 675 },
  ]);
  assert.equal(normalizeTrack({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: line },
    }],
  }).length, 2);
  assert.equal(normalizeTrack({
    type: "MultiLineString",
    coordinates: [line, [[-82.53, 35.6]]],
  }).length, 2);
});

test("selects one longest segment instead of inventing edges between routes", () => {
  const disconnected = normalizeTrack({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-82.55, 35.58], [-82.549, 35.581]] },
      },
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[-100, 35], [-99, 36], [-98, 37]] },
      },
    ],
  });
  assert.deepEqual(disconnected.map(({ lat, lng }) => ({ lat, lng })), [
    { lat: 35, lng: -100 },
    { lat: 36, lng: -99 },
    { lat: 37, lng: -98 },
  ]);
});

test("uses the first usable route representation", () => {
  const guide = normalizeRideGuide({
    id: "guide-1",
    slug: "guide-1",
    title: "Guide",
    trackCoordinates: { type: "FeatureCollection", features: [] },
    gpxCoordinates: line,
  });
  assert.equal(guide?.trackCoordinates.length, 2);
});