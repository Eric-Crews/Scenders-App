---
name: Mobile session revalidation
description: Keep mobile authentication state aligned with server-backed session validity before privileged actions.
---

Mobile account UI can retain a user object after its server-side session has expired. Before a privileged, time-sensitive action such as sending a private live-location SMS, revalidate the stored session and present a clear sign-in recovery path when it is no longer valid.

**Why:** A stale app session otherwise looks authenticated but sends an invalid bearer session identifier, resulting in a generic 401 after the user has entered sensitive sharing details.

**How to apply:** Treat a locally cached user as a display state, not proof of current authorization. Refresh session validity when opening privileged flows and translate any authorization rejection into an explicit sign-in-again action.