---
name: Android release page handoff
description: Keeping the public Android download page aligned with a newly built, verified AAB.
---

When an Android AAB is registered as a workspace Library output, do not assume that artifact is present in the main workspace or publicly downloadable from the website. The release page must receive the exact verified AAB in its public asset directory and have its version, size, SHA-256, and filename updated together before publishing.

**Why:** Task-agent output registration preserves release metadata and a managed storage reference, but it does not necessarily materialize the binary in the merged workspace. A static-site fallback can return HTML with a 200 response for a missing bundle path, making an absent AAB look superficially live.

**How to apply:** Before publishing a new Android release page, use a byte-range or headers check to confirm the public filename returns an archive with the expected size—not an HTML fallback. If the merged workspace lacks the release file, restore the Library asset through a supported path or rebuild it before changing the page metadata.