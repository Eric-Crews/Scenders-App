declare module "@mapbox/togeojson" {
  import type { FeatureCollection } from "geojson";
  const kml: (doc: Document) => FeatureCollection;
  const gpx: (doc: Document) => FeatureCollection;
  export default { kml, gpx };
}
