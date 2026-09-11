/**
 * Distance/elevation formatting that respects the user's chosen unit system.
 * Stored values are always in meters; these helpers are the single place that
 * converts to a display string so a single preference flips the whole app.
 */
export type UnitSystem = "metric" | "imperial";

const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;

/** Format a horizontal distance (meters) as m/km or ft/mi. */
export function formatDistance(
  meters: number,
  units: UnitSystem = "metric",
): string {
  if (units === "imperial") {
    const feet = meters * FEET_PER_METER;
    if (feet < FEET_PER_MILE) return `${Math.round(feet)} ft`;
    return `${(feet / FEET_PER_MILE).toFixed(2)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Off-route distance presets, in display units, that map to clean round numbers.
 * Metric presets are meters; imperial presets are feet. The selector and stored
 * threshold are always meters, so imperial presets are converted on the way in.
 */
const OFF_ROUTE_PRESETS_METRIC_M = [25, 50, 100] as const;
const OFF_ROUTE_PRESETS_IMPERIAL_FT = [100, 200, 300] as const;

/** Off-route threshold presets (in meters) appropriate for the unit system. */
export function offRouteThresholdPresets(units: UnitSystem): number[] {
  if (units === "imperial") {
    return OFF_ROUTE_PRESETS_IMPERIAL_FT.map((ft) => ft / FEET_PER_METER);
  }
  return [...OFF_ROUTE_PRESETS_METRIC_M];
}

/** Every valid off-route threshold value (meters) across both unit systems. */
export const OFF_ROUTE_THRESHOLD_VALUES: readonly number[] = [
  ...OFF_ROUTE_PRESETS_METRIC_M,
  ...OFF_ROUTE_PRESETS_IMPERIAL_FT.map((ft) => ft / FEET_PER_METER),
];

/** Format an elevation/altitude (meters) as m or ft. */
export function formatElevation(
  meters: number,
  units: UnitSystem = "metric",
): string {
  if (units === "imperial") {
    return `${Math.round(meters * FEET_PER_METER)} ft`;
  }
  return `${Math.round(meters)} m`;
}
