---
name: Publishing image size
description: Keeping this monorepo’s Replit publish image below the layer-size limit without breaking the production API.
---

Keep development caches, installed workspace dependencies, duplicate local release files, and Git history out of the published Repl layer through `.replitignore`. Before excluding dependency directories, ensure the API production output bundles every runtime import and verify that output can start in an isolated directory.

**Why:** A multi-gigabyte workspace dependency tree and build caches can push the Repl image over Replit’s 8 GiB limit even when the application builds successfully. The API originally externalized its Google Cloud Storage dependency, so ignoring dependencies would have caused a production startup failure.

**How to apply:** For release-image changes, rebuild the API and run its output without workspace `node_modules`; confirm its health endpoint responds after a normal workflow restart. Keep the downloadable Android bundle in the site’s public assets while excluding only the duplicate local release copy.