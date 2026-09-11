import React, { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import { elevationStats } from "@/lib/elevation";
import { haversineMeters } from "@/lib/geo";
import type { TrackPoint } from "@/lib/types";
import { formatDistance, formatElevation } from "@/lib/units";

/** A point picked out by scrubbing along the chart. */
export type ScrubPoint = {
  lat: number;
  lng: number;
  dist: number;
  alt: number;
};

type Props = {
  points: TrackPoint[];
  /** Height of the chart area in points. */
  height?: number;
  /**
   * Fired as the user drags a finger along the chart. Receives the interpolated
   * point on the route (lat/lng + distance + elevation), or `null` when the
   * finger lifts. Use it to move a highlight marker on a map.
   */
  onScrub?: (point: ScrubPoint | null) => void;
  /**
   * Cumulative distance (in meters from the route start) of a fixed "you are
   * here" marker, e.g. the hiker's projected position while following a route.
   * The marker rides the profile line at this distance. Pass `null`/`undefined`
   * to hide it. Quietly ignored when the route carries no elevation data.
   */
  markerDist?: number | null;
  /**
   * Cumulative distance range (meters from route start) to shade in the climb
   * color, mirroring the next-climb highlight drawn on the map. Pass
   * `null`/`undefined` to draw no band. Clamped to the plotted range.
   */
  highlightRange?: { startDist: number; endDist: number } | null;
};

type Sample = { dist: number; alt: number; lat: number; lng: number };

type ScrubState = { px: number; py: number; dist: number; alt: number };

/**
 * Compact elevation-vs-distance profile for a route. X axis is cumulative
 * distance, Y axis is ground elevation. Cumulative distance is summed across
 * every point so gaps in elevation data don't distort horizontal spacing.
 * Degrades gracefully to a hint when fewer than two points carry altitude
 * (e.g. routes plotted offline).
 *
 * Dragging a finger across the chart picks out the matching point on the route:
 * a marker and callout track the touch, and `onScrub` reports the interpolated
 * location so a parent can highlight it on a map.
 */
export default function ElevationProfile({
  points,
  height = 96,
  onScrub,
  markerDist,
  highlightRange,
}: Props) {
  const colors = useColors();
  const { settings } = useMaps();
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<ScrubState | null>(null);
  const [calloutW, setCalloutW] = useState(0);

  const samples = useMemo<Sample[]>(() => {
    const out: Sample[] = [];
    let cumulative = 0;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        cumulative += haversineMeters(
          points[i - 1].lat,
          points[i - 1].lng,
          points[i].lat,
          points[i].lng,
        );
      }
      const alt = points[i].alt;
      if (typeof alt === "number" && Number.isFinite(alt)) {
        out.push({ dist: cumulative, alt, lat: points[i].lat, lng: points[i].lng });
      }
    }
    return out;
  }, [points]);

  const stats = useMemo(
    () => elevationStats(points.map((p) => p.alt)),
    [points],
  );

  const hasProfile = samples.length >= 2;

  const geom = useMemo(() => {
    if (!hasProfile || width <= 0) return null;
    const padX = 2;
    const padTop = 8;
    const padBottom = 4;
    const plotW = Math.max(1, width - padX * 2);
    const plotH = Math.max(1, height - padTop - padBottom);

    const maxDist = samples[samples.length - 1].dist || 1;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of samples) {
      if (s.alt < lo) lo = s.alt;
      if (s.alt > hi) hi = s.alt;
    }
    // Avoid a flat zero-height range for level routes.
    const span = hi - lo < 1 ? 1 : hi - lo;

    const x = (d: number) => padX + (d / maxDist) * plotW;
    const y = (a: number) => padTop + (1 - (a - lo) / span) * plotH;

    let line = "";
    samples.forEach((s, i) => {
      line += `${i === 0 ? "M" : "L"}${x(s.dist).toFixed(2)},${y(s.alt).toFixed(2)} `;
    });

    const baseline = height - padBottom;
    const area = `${line}L${x(maxDist).toFixed(2)},${baseline.toFixed(2)} L${x(0).toFixed(2)},${baseline.toFixed(2)} Z`;

    return {
      padX,
      padTop,
      plotW,
      maxDist,
      x,
      y,
      baseline,
      line: line.trim(),
      area,
    };
  }, [hasProfile, width, height, samples]);

  // Fixed "you are here" marker (e.g. the hiker's projected position while
  // following). Interpolates the altitude at the given cumulative distance and
  // places a marker on the profile line; clamped to the plotted range so a
  // position past the last altitude-bearing point still pins to the end.
  const liveMarker = useMemo(() => {
    if (!geom || markerDist == null || !Number.isFinite(markerDist)) return null;
    if (samples.length === 0) return null;
    const d = Math.max(0, markerDist);
    let alt: number;
    if (d <= samples[0].dist) {
      alt = samples[0].alt;
    } else if (d >= samples[samples.length - 1].dist) {
      alt = samples[samples.length - 1].alt;
    } else {
      alt = samples[samples.length - 1].alt;
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        if (d >= a.dist && d <= b.dist) {
          const range = b.dist - a.dist;
          const t = range > 0 ? (d - a.dist) / range : 0;
          alt = a.alt + (b.alt - a.alt) * t;
          break;
        }
      }
    }
    const clampedDist = Math.max(0, Math.min(geom.maxDist, d));
    return { px: geom.x(clampedDist), py: geom.y(alt) };
  }, [geom, markerDist, samples]);

  // Translucent band marking the next climb, mirroring the map highlight so the
  // profile region and the on-map line read as the same stretch of trail.
  const climbBand = useMemo(() => {
    if (!geom || !highlightRange) return null;
    const from = Math.max(0, Math.min(geom.maxDist, highlightRange.startDist));
    const to = Math.max(0, Math.min(geom.maxDist, highlightRange.endDist));
    if (to <= from) return null;
    const x1 = geom.x(from);
    const x2 = geom.x(to);
    return { x: x1, width: Math.max(1, x2 - x1) };
  }, [geom, highlightRange]);

  // Refs keep the pan handlers reading fresh geometry/samples without having to
  // rebuild the PanResponder on every layout change.
  const geomRef = useRef(geom);
  geomRef.current = geom;
  const samplesRef = useRef(samples);
  samplesRef.current = samples;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => handleScrub(e.nativeEvent.locationX),
      onPanResponderMove: (e) => handleScrub(e.nativeEvent.locationX),
      onPanResponderRelease: clearScrub,
      onPanResponderTerminate: clearScrub,
    }),
  ).current;

  function interpolate(d: number): ScrubPoint | null {
    const ss = samplesRef.current;
    if (ss.length === 0) return null;
    if (d <= ss[0].dist) {
      const s = ss[0];
      return { dist: s.dist, alt: s.alt, lat: s.lat, lng: s.lng };
    }
    const last = ss[ss.length - 1];
    if (d >= last.dist) {
      return { dist: last.dist, alt: last.alt, lat: last.lat, lng: last.lng };
    }
    for (let i = 0; i < ss.length - 1; i++) {
      const a = ss[i];
      const b = ss[i + 1];
      if (d >= a.dist && d <= b.dist) {
        const range = b.dist - a.dist;
        const t = range > 0 ? (d - a.dist) / range : 0;
        return {
          dist: d,
          alt: a.alt + (b.alt - a.alt) * t,
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        };
      }
    }
    return { dist: last.dist, alt: last.alt, lat: last.lat, lng: last.lng };
  }

  function handleScrub(localX: number) {
    const g = geomRef.current;
    if (!g) return;
    const clamped = Math.max(g.padX, Math.min(g.padX + g.plotW, localX));
    const d = ((clamped - g.padX) / g.plotW) * g.maxDist;
    const p = interpolate(d);
    if (!p) return;
    setScrub({ px: g.x(p.dist), py: g.y(p.alt), dist: p.dist, alt: p.alt });
    onScrubRef.current?.(p);
  }

  function clearScrub() {
    setScrub(null);
    onScrubRef.current?.(null);
  }

  const calloutLeft = scrub
    ? Math.max(0, Math.min(width - calloutW, scrub.px - calloutW / 2))
    : 0;

  return (
    <View style={{ gap: 8 }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          styles.chart,
          {
            height,
            backgroundColor: colors.muted,
            borderColor: colors.border,
          },
        ]}
        {...(hasProfile ? pan.panHandlers : {})}
      >
        {hasProfile && geom ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0.04} />
              </LinearGradient>
            </Defs>
            {climbBand && (
              <Rect
                x={climbBand.x}
                y={geom.padTop}
                width={climbBand.width}
                height={geom.baseline - geom.padTop}
                fill={colors.climb}
                opacity={0.16}
              />
            )}
            <Path d={geom.area} fill="url(#elevFill)" />
            <Path
              d={geom.line}
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {liveMarker && (
              <>
                <Line
                  x1={liveMarker.px}
                  y1={geom.padTop}
                  x2={liveMarker.px}
                  y2={geom.baseline}
                  stroke={colors.accent}
                  strokeWidth={1.5}
                  opacity={0.5}
                />
                <Circle
                  cx={liveMarker.px}
                  cy={liveMarker.py}
                  r={8}
                  fill={colors.accent}
                  opacity={0.2}
                />
                <Circle
                  cx={liveMarker.px}
                  cy={liveMarker.py}
                  r={5}
                  fill={colors.accent}
                  stroke={colors.background}
                  strokeWidth={2}
                />
              </>
            )}
            {scrub && (
              <>
                <Line
                  x1={scrub.px}
                  y1={geom.padTop}
                  x2={scrub.px}
                  y2={geom.baseline}
                  stroke={colors.primary}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.7}
                />
                <Circle
                  cx={scrub.px}
                  cy={scrub.py}
                  r={5}
                  fill={colors.primary}
                  stroke={colors.background}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No elevation data for this route
            </Text>
          </View>
        )}
        {scrub && (
          <View
            pointerEvents="none"
            onLayout={(e) => setCalloutW(e.nativeEvent.layout.width)}
            style={[
              styles.callout,
              { backgroundColor: colors.foreground, left: calloutLeft },
            ]}
          >
            <Text style={[styles.calloutText, { color: colors.background }]}>
              {formatDistance(scrub.dist)} · {Math.round(scrub.alt)} m
            </Text>
          </View>
        )}
      </View>
      {hasProfile && stats.minMeters !== null && stats.maxMeters !== null && (
        <View style={styles.legend}>
          <Stat
            label="Gain"
            value={`↑ ${formatElevation(stats.gainMeters, settings.units)}`}
            color={colors.foreground}
            muted={colors.mutedForeground}
          />
          <Stat
            label="Loss"
            value={`↓ ${formatElevation(stats.lossMeters, settings.units)}`}
            color={colors.foreground}
            muted={colors.mutedForeground}
          />
          <Stat
            label="Min"
            value={formatElevation(stats.minMeters, settings.units)}
            color={colors.foreground}
            muted={colors.mutedForeground}
          />
          <Stat
            label="Max"
            value={formatElevation(stats.maxMeters, settings.units)}
            color={colors.foreground}
            muted={colors.mutedForeground}
          />
        </View>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 12, textAlign: "center" },
  callout: {
    position: "absolute",
    top: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  calloutText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: { gap: 1 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 10 },
  statValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
