export type LiveSyncState =
  | "up-to-date"
  | "waiting-for-network"
  | "retrying"
  | "needs-attention";

/**
 * Translate transport failures into a safe, actionable state for the recorder.
 * The UI never shows a server response or the device owner capability.
 */
export function liveSyncFailureState(error: unknown): LiveSyncState {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;

  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return "needs-attention";
  }
  if (status !== undefined) return "retrying";
  return "waiting-for-network";
}