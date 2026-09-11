---
name: Mobile place geocoding
description: Why mobile location-search uses expo-location geocodeAsync, not an HTTP geocoder like Nominatim
---

For "search another place" location features in the Expo app, prefer
`Location.geocodeAsync(query)` (expo-location) over an HTTP geocoder such as
OSM Nominatim.

**Why:** React Native's `fetch` cannot reliably set a custom `User-Agent`
header (the platform overrides/appends it), and Nominatim's usage policy
rejects requests without a proper identifying UA — so the on-brand OSM HTTP
route is flaky/forbidden cross-platform. `geocodeAsync` uses the native OS
geocoder, needs no API key, no network etiquette, and works on iOS + Android.

**How to apply:** It returns lat/lng only (no display name), so label the
chosen origin with the user's typed query. Take the first result; alert if the
array is empty. No location permission is required for geocoding (only for
`getCurrentPositionAsync`).
