---
name: Map tile layers (mobile)
description: How base/overlay map layers are added and the tile-format gotcha for offline caching
---

Adding a map base or overlay layer is **config-only**: add the id to `BaseLayerId`/`OverlayLayerId` and an entry to `BASE_LAYERS`/`OVERLAY_LAYERS` in `artifacts/mobile/lib/mapLayers.ts`. The LayersSheet UI, the Leaflet WebView renderer (`leafletHtml.ts`), the offline tile cache (`tiles.ts`, keyed off `ALL_LAYERS`/`resolveTileUrl`), and `MapsContext` persistence validation all derive from that registry — no other wiring needed.

- URL templates support `{s}` `{z}` `{x}` `{y}` in **any order** (token-by-token replace), so Esri-style `{z}/{y}/{x}` works. Omit `subdomains` for providers without `{s}`.
- `LayerConfig.opacity?` overrides the default (1 for bases, 0.85 for overlays) — e.g. hillshade at 0.45 so it blends.

**Tile-format gotcha (cost 1 review cycle):** tiles are saved to disk with a `.png` filename regardless of real format. OSM/OpenTopoMap/CyclOSM/Waymarked are PNG, but **Esri imagery + hillshade are JPEG**. WKWebView can refuse to decode a JPEG served under a `data:image/png` URL when offline.
**Why:** the offline manifest injects base64 data URLs into the WebView; the MIME must match the real bytes.
**How to apply:** `readTileBase64` sniffs the base64 magic prefix (`/9j/` → jpeg, else png) instead of hardcoding png. Any new provider in another format must be covered there. The web path is fine — `FileReader.readAsDataURL` already sets the correct MIME.

No-key providers in use: Esri World Imagery (`World_Imagery`) and Esri World Hillshade (`Elevation/World_Hillshade`), both return 200 image/jpeg with no API key.
