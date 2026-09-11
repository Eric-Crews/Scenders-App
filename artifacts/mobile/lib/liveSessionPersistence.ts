import type { LiveSession } from "./liveSharing";

export type PersistedLiveSession = Omit<
  LiveSession,
  "ownerCapability" | "token" | "url"
>;

/**
 * Keep bearer capabilities out of AsyncStorage. The owner secret is stored in
 * SecureStore and the viewer-link data is recovered only into memory.
 */
export function toPersistedLiveSession(
  session: LiveSession,
): PersistedLiveSession {
  const {
    ownerCapability: _ownerCapability,
    token: _token,
    url: _url,
    ...persisted
  } = session;
  return persisted;
}