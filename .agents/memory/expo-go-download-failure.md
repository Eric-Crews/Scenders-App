---
name: Expo Go "Failed to download remote update"
description: What to check when Expo Go fails to load the dev bundle on a device
---

# Expo Go: "java.io.IOException: Failed to download remote update"

Symptom: Expo Go (Android) shows a red fatal error "Failed to download remote update"
when opening the dev link, even though Metro is running and the manifest/bundle
serve fine from the server side (curl the manifest + entry.bundle → HTTP 200).

**First thing to check: SDK package version skew.** Metro logs print
"The following packages should be updated for best compatibility ... Your project
may not work correctly until you install the expected versions." A patch mismatch
between the installed `expo` runtime and what the Expo Go client expects can break
the update/manifest protocol and cause this exact download error.

**Fix:** in the mobile artifact run `pnpm exec expo install --fix` (use `CI=1` to
avoid interactive prompts; it may need a second run if interrupted). Then restart
the expo workflow and re-verify: manifest HTTP 200 and `entry.bundle` downloads
clean for both `expo-platform: ios` and `android`.

**Why:** Expo Go is built against a specific SDK patch; the dev bundle/manifest it
fetches must match. The flagged packages here were not catalog-pinned, so
`expo install --fix` is safe.

**Also rule out (client-side, can't fix from server):** large dev bundle (~11MB)
timing out over slow mobile data — suggest WiFi; Expo Go version must support the
project's SDK (this project is SDK 54); restrictive VPN/corporate network.
