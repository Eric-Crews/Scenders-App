declare module "@mapbox/togeojson" {
  const toGeoJSON: {
    gpx: (doc: unknown) => { type: string; features: unknown[] };
    kml: (doc: unknown) => { type: string; features: unknown[] };
  };
  export default toGeoJSON;
}
