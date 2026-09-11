import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import type { RideGuideTrackPoint } from "@/lib/rideForest";

type Props = {
  points: RideGuideTrackPoint[];
  height?: number;
  label?: string;
};

const WIDTH = 320;
const PADDING = 22;

export function RideRoutePreview({ points, height = 180, label }: Props) {
  const colors = useColors();
  const route = useMemo(() => {
    if (points.length < 2) return null;
    const step = Math.max(1, Math.ceil(points.length / 300));
    const sampled = points.filter(
      (_point, index) => index % step === 0 || index === points.length - 1,
    );
    const lngs = sampled.map((point) => point.lng);
    const lats = sampled.map((point) => point.lat);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const lngRange = Math.max(east - west, 0.00001);
    const latRange = Math.max(north - south, 0.00001);
    const innerWidth = WIDTH - PADDING * 2;
    const innerHeight = height - PADDING * 2;
    const projected = sampled.map((point) => ({
      x: PADDING + ((point.lng - west) / lngRange) * innerWidth,
      y: PADDING + (1 - (point.lat - south) / latRange) * innerHeight,
    }));
    return {
      points: projected.map((point) => `${point.x},${point.y}`).join(" "),
      start: projected[0],
      end: projected[projected.length - 1],
    };
  }, [height, points]);

  return (
    <View
      style={[
        styles.container,
        { height, backgroundColor: colors.routeBackground },
      ]}
    >
      {route ? (
        <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${height}`}>
          <Polyline
            points={route.points}
            fill="none"
            stroke={colors.routeCasing}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points={route.points}
            fill="none"
            stroke={colors.route}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle
            cx={route.start.x}
            cy={route.start.y}
            r={6}
            fill={colors.success}
            stroke={colors.routeCasing}
            strokeWidth={2}
          />
          <Circle
            cx={route.end.x}
            cy={route.end.y}
            r={6}
            fill={colors.route}
            stroke={colors.routeCasing}
            strokeWidth={2}
          />
        </Svg>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Route track coming soon
          </Text>
        </View>
      )}
      {label ? (
        <View style={[styles.label, { backgroundColor: colors.overlay }]}>
          <Text style={[styles.labelText, { color: colors.routeForeground }]}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  empty: { alignItems: "center", flex: 1, justifyContent: "center" },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  label: {
    borderRadius: 999,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    top: 12,
  },
  labelText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
