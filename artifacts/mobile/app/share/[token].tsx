import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchSharedPrivateProject,
  fetchSharedTrack,
  sharedToTrackInput,
  type SharedTrack,
} from "@/lib/shared";
import type { PrivateProjectContent } from "@/lib/privateProjects";
import { formatDuration } from "@/lib/trackRecording";
import { formatDistance } from "@/lib/units";

export default function SharedRouteScreen() {
  const { token, mode } = useLocalSearchParams<{
    token: string;
    mode?: "private";
  }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addTrack, settings } = useMaps();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<SharedTrack | null>(null);
  const [privateProject, setPrivateProject] =
    useState<PrivateProjectContent | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError("This link is missing its route.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        if (mode === "private") {
          const project = await fetchSharedPrivateProject(token);
          if (!cancelled) {
            setPrivateProject(project);
            setRoute({ ...project.route, description: project.route.description ?? null });
          }
        } else {
          const r = await fetchSharedTrack(token);
          if (!cancelled) setRoute(r);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "This route link is no longer available.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, mode]);

  const ensureSaved = (): string | null => {
    if (mode === "private") return null;
    if (savedId) return savedId;
    if (!route) return null;
    const t = addTrack(sharedToTrackInput(route));
    setSavedId(t.id);
    return t.id;
  };

  const handleSave = () => {
    if (ensureSaved()) {
      Alert.alert("Saved", "This route is now in your routes.");
    }
  };

  const handleViewOnMap = () => {
    const id = ensureSaved();
    if (id) {
      router.replace({ pathname: "/", params: { follow: id } });
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !route) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background, padding: 24 },
        ]}
      >
        <Feather name="map" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Route unavailable
        </Text>
        <Text style={[styles.errorBody, { color: colors.mutedForeground }]}>
          {error ?? "This route link is no longer available."}
        </Text>
        <Pressable
          onPress={() => router.replace("/")}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
              marginTop: 20,
            },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
            Go to map
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
          {mode === "private" ? "Private project" : "Shared route"}
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {route.name}
        </Text>
        {route.description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {route.description}
          </Text>
        ) : null}

        <View
          style={[
            styles.statsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.statRow}>
            <Feather name="trending-up" size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {formatDistance(route.distanceMeters, settings.units)}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Feather name="clock" size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {formatDuration(route.durationMs)}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Feather name="map-pin" size={16} color={colors.primary} />
            <Text style={[styles.statText, { color: colors.foreground }]}>
              {route.pointCount} points
            </Text>
          </View>
        </View>
        {mode === "private" ? (
          <View style={styles.contextSection}>
            <Text style={[styles.contextTitle, { color: colors.foreground }]}>
              Field notes & locations
            </Text>
            {privateProject?.waypoints.length ? (
              privateProject.waypoints.map((waypoint) => (
                <View
                  key={waypoint.id}
                  style={[
                    styles.waypointCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.waypointHeader}>
                    <Feather name="map-pin" size={16} color={colors.primary} />
                    <Text
                      style={[
                        styles.waypointName,
                        { color: colors.foreground },
                      ]}
                    >
                      {waypoint.name}
                    </Text>
                  </View>
                  {waypoint.notes ? (
                    <Text
                      style={[
                        styles.waypointNotes,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {waypoint.notes}
                    </Text>
                  ) : null}
                  {waypoint.photoUrl ? (
                    <Image
                      source={{ uri: waypoint.photoUrl }}
                      style={styles.waypointPhoto}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <Text
                style={[styles.emptyContext, { color: colors.mutedForeground }]}
              >
                No linked field notes or photos were added to this route.
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {mode !== "private" ? (
        <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="download" size={18} color={colors.foreground} />
          <Text style={[styles.btnText, { color: colors.foreground }]}>
            {savedId ? "Saved" : "Save to my routes"}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleViewOnMap}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="map" size={18} color={colors.primaryForeground} />
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
            View on map
          </Text>
        </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyNotice}>
          <Feather name="lock" size={16} color={colors.mutedForeground} />
          <Text style={[styles.readOnlyText, { color: colors.mutedForeground }]}>
            View-only private project. This project is not saved to your routes.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  container: { flex: 1, justifyContent: "space-between" },
  body: { padding: 24, paddingBottom: 32 },
  eyebrow: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    marginTop: 6,
  },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  statsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    gap: 14,
  },
  contextSection: { marginTop: 28, gap: 10 },
  contextTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  waypointCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 },
  waypointHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  waypointName: { fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1 },
  waypointNotes: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  waypointPhoto: { width: "100%", height: 180, borderRadius: 10, marginTop: 2 },
  emptyContext: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statText: { fontFamily: "Inter_500Medium", fontSize: 15 },
  actions: { paddingHorizontal: 24, gap: 12 },
  readOnlyNotice: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readOnlyText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 16,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 16,
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 20, marginTop: 8 },
  errorBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 6,
  },
});
