---
name: Expo publish versioning
description: App Store Connect version rules for retrying mapper.one iOS submissions.
---

Once an App Store Connect marketing version has been approved or its pre-release train has closed, the next Expo Launch submission must use a higher `expo.version` in the static mobile app configuration. Keep the bundle identifier unchanged; Expo Launch can continue the build-number sequence.

**Why:** Apple rejects a new binary with the same `CFBundleShortVersionString` as the approved version and reports the closed pre-release train as a second upload error.

**How to apply:** Before retrying an iOS publish, compare the static app version with the latest approved App Store version, bump the marketing version when needed, and let the managed launch flow handle the incremental build number.