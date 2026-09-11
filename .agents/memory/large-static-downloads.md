---
name: Large static downloads
description: Replit static-host behavior for the signed Android bundle and other large downloadable assets.
---

Serve large published files through client-side byte-range requests kept below roughly 8 MB, with retries and final assembly in a Blob. Keep the original file and checksum unchanged.

**Why:** The published static host served small ranges and resumable requests but returned HTTP 500 for a normal full GET or a range larger than roughly 8 MB, causing Chrome to show “Site wasn’t available” for the Android bundle.

**How to apply:** For large static downloads, request conservative chunks (4 MB), require HTTP 206 and the expected chunk size, retry transient failures, then trigger the browser save only after all chunks are assembled.