---
name: Android release delivery
description: Persistent policy for producing and handing off mapper.one Android releases.
---

Use the Expo remote-build path for Android Play releases. Do not recreate the removed local Gradle-release script, Android toolchain configuration, local keystores, PEM certificates, or local AAB output directories in the workspace.

**Why:** Full Expo/React Native Android builds consume substantial native toolchain and cache storage, while private signing material should not remain alongside the app workspace. The remote service already holds the intended upload credential for future release builds.

**How to apply:** Keep the app’s Expo project linkage, EAS configuration, and compatible package-manager pin intact. Trigger release bundles remotely from the intended source branch and monorepo base directory, validate the finished artifact before Play upload, and use the existing remote upload credential. If Google Play is processing an upload-key reset, wait for its stated activation time before attempting the next upload.

For installable Android test APKs, use a separate internal-distribution profile that pins Expo’s current build image.

**Why:** An automatic older Android builder can select pnpm 8, which cannot read this workspace’s pnpm 10 lockfile and fails before native compilation.

**How to apply:** Keep test APKs separate from the Play AAB profile, use the current remote source branch plus monorepo base directory, and never auto-submit the test artifact to a store.