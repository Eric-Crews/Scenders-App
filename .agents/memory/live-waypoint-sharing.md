---
name: Live waypoint sharing
description: Product rule for photo waypoints created while a private live route is active
---

During an active live route share, adding a waypoint is the recorder’s explicit intent to share it. Photo waypoints should be delivered to the remote viewer with their location, title, note, timestamp, and photo; no second per-waypoint sharing toggle is needed.

**Why:** The recorder does not have to add a waypoint at all, so choosing to add one while sharing is sufficient consent and keeps the field workflow fast.

**How to apply:** Scope the waypoint/photo access to the private live-share capability, publish a new-waypoint event to the viewer, and stop publishing after the activity is completed or revoked. Queue the event/photo until connectivity returns rather than silently dropping it.