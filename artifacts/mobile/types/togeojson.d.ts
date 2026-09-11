declare module "@mapbox/togeojson" {
  const toGeoJSON: {
    kml: (doc: Document) => unknown;
    gpx: (doc: Document) => unknown;
  };
  export default toGeoJSON;
}

declare module "xmldom" {
  export class DOMParser {
    parseFromString(source: string, mimeType?: string): Document;
  }
}
