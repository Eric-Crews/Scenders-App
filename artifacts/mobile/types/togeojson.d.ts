declare module "@mapbox/togeojson" {
  const toGeoJSON: {
    kml: (doc: unknown) => unknown;
    gpx: (doc: unknown) => unknown;
  };
  export default toGeoJSON;
}
