---
name: Trail guide admin eligibility
description: Prevent guide selections from becoming invalid when the route library changes in the background.
---

Guide generation must revalidate the exact submitted source identifiers, rather than rebuilding a capped, newest-first list and looking selections up in that list. The guide index should not be cached while publishing or replacing a guide can change its contents.

**Why:** Background route imports can move a still-valid selection outside the dashboard's finite result window between page load and submission, producing a false "no longer eligible" error. Cached guide indexes can continue to show an old guide after it has been replaced.

**How to apply:** Parse and allowlist each submitted source key, reload that source directly, and verify public visibility plus valid route geometry. Return the current guide index with `no-store` caching.