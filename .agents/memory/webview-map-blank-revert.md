---
name: WebView Leaflet map blank after photo-viewer change
description: Adding a full-screen photo Modal alongside the Leaflet WebView correlated with a blank map on Android Expo Go; safe recovery is restoring leafletHtml.ts/MapView.tsx to the last-good commit.
---

When the Leaflet map renders only its CSS background (khaki #ece4d3) with
controls but no tiles on Android Expo Go, the WebView IIFE is initializing
partway (or tiles never fetch) — not a layout problem.

A full-screen waypoint-photo viewer (react-native `Modal` sibling to the
`<WebView>` in index.tsx, plus inline `onclick="post(...)"` in popup HTML and a
`window.post` assignment inside the IIFE) was introduced and the map went blank.
Three targeted fixes (conditional Modal mount, moving `post` to a global
`<script>`, WebView diag reporting) did NOT restore tiles. Root cause was never
confirmed by device logs.

**Why:** the device kept loading a stale bundle — Metro only ever logged
"Web Bundled", never "Android Bundled", meaning Expo Go was not pulling the
updated dev bundle (Fast Refresh also keeps the old WebView HTML because
`getLeafletHtml()` caches in a module var and MapView reads it once on mount).
So fixes shipped but were never actually exercised on device.

**How to apply:**
- If a WebView map goes blank after a change, restoring `leafletHtml.ts` and
  `components/MapView.tsx` wholesale to the last-known-good commit is safe — since
  the working baseline, the only edits to those two files were the photo viewer
  and debug code (verify with `git log <good>..HEAD -- <file>`).
- index.tsx mixed the photo viewer with an unrelated "publish to community"
  toggle in the same commit, so revert index.tsx surgically, not wholesale.
- Before trusting ANY mobile fix, confirm the device pulled it: look for
  "Android Bundled" in the Metro log. "Web Bundled" only = device never
  reloaded the native bundle; tell the user to fully reload (dev menu → Reload,
  or close+reopen Expo Go), not just save-refresh.
