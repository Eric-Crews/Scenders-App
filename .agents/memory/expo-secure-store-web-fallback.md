---
name: Expo SecureStore web fallback
description: Securely persist mobile bearer secrets without breaking the Expo web preview.
---

Persist mobile bearer capabilities through Expo SecureStore on Android and iOS, but do not call its current web shim. For web builds, keep the capability only in memory and do not write it to ordinary browser storage.

**Why:** The installed Expo SecureStore web module exposes an incompatible native-method shape in this workspace and crashes when its public async API is called. Falling back to AsyncStorage would expose a device-control bearer secret.

**How to apply:** Keep a small platform-aware storage adapter around sensitive mobile credentials. The loss of an anonymous capability after a browser refresh is safer than persisting it insecurely; native devices retain the capability in secure storage.