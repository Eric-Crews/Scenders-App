import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_MAP_LABEL,
  publicCommunityMapGeoJson,
  publicCommunityMapMetadata,
  redactCommunityMapSourceText,
} from "./communityMapSource";

test("redacted community-map responses keep geometry but remove upstream feature metadata", () => {
  const source = {
    description: "[supportal:abc123] Imported from Adventure Collective trail source",
    author: "Venture Out API",
  };
  const metadata = publicCommunityMapMetadata(source);
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        name: "Adventure Collective trail source",
        description: "Imported via Supportal API",
        notes: { upstreamUrl: "https://supportal.example/trails/abc123" },
        sourceUrl: "https://supportal.example/trails/abc123",
        privateImportId: "abc123",
        kind: "route",
      },
      geometry: { type: "LineString", coordinates: [[-119.57, 37.73], [-119.56, 37.74]] },
    }],
    upstreamProvider: { url: "https://supportal.example" },
  };

  const publicGeojson = publicCommunityMapGeoJson(geojson, metadata.isCommunityMapSource) as typeof geojson;
  const serialized = JSON.stringify({
    name: redactCommunityMapSourceText("Adventure Collective trail source"),
    description: metadata.description,
    author: metadata.author,
    geojson: publicGeojson,
  });

  assert.equal(metadata.isCommunityMapSource, true);
  assert.equal(metadata.author, COMMUNITY_MAP_LABEL);
  assert.doesNotMatch(serialized, /supportal|venture out|adventure collective|sourceUrl|privateImportId|upstreamProvider/i);
  assert.deepEqual(publicGeojson.features[0].geometry, geojson.features[0].geometry);
  assert.deepEqual(Object.keys(publicGeojson.features[0].properties).sort(), ["description", "kind", "name"]);
  assert.deepEqual(Object.keys(publicGeojson).sort(), ["features", "type"]);
});

test("ordinary community maps preserve their public feature properties", () => {
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { name: "Trail marker", category: "water" },
      geometry: { type: "Point", coordinates: [-119.57, 37.73] },
    }],
  };

  assert.deepEqual(publicCommunityMapGeoJson(geojson, false), geojson);
});