---
name: Post-merge schema synchronization
description: Safely reconcile development database schemas and TypeScript project-reference declarations after a task merge.
---

Drizzle Kit's `push --force` does not resolve an ambiguous column-rename choice. When post-merge setup has closed stdin, it can print the prompt, exit successfully, and leave the development schema unchanged.

**Why:** A merge introduced a new live-sharing schema while the development database still held an unrelated older table shape. The post-merge script appeared successful but the server failed against missing columns.

**How to apply:** Treat any emitted rename prompt as an unresolved migration, not success. Inspect the development schema and perform a deliberate reconciliation before retrying. Refresh the database and generated API-contract declaration packages before server typechecks; project-reference `dist` declarations can otherwise lag merged source files.