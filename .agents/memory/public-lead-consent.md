---
name: Public lead consent
description: Safeguards for public lead-capture endpoints generated from the OpenAPI contract.
---

For a public email-capture endpoint, do not rely on an OpenAPI `const: true` boolean to prove consent after client/Zod generation. Explicitly reject any parsed request whose consent value is not `true`, before persisting a lead.

**Why:** The generated Zod schema represented the `const: true` field as a general boolean. A direct API caller could therefore submit `false` even though the browser checkbox required opt-in.

**How to apply:** Keep consent enforcement in the server handler, normalize and uniquely store the email, and always return an invariant success body/status for valid submissions so the endpoint cannot reveal whether a particular email has previously registered.