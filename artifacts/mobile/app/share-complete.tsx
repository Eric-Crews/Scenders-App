import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { confirmPrivateProject, type PrivateProject } from "@/lib/privateProjects";

export default function ShareCompleteScreen() {
  const { projectId, sessionId, cancelled } = useLocalSearchParams<{
    projectId?: string;
    sessionId?: string;
    cancelled?: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [project, setProject] = useState<PrivateProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelledRequest = false;
    if (cancelled === "1") {
      setError("Checkout was cancelled. Your route has not been shared privately.");
      return;
    }
    if (!projectId || !sessionId) {
      setError("We couldn't find this checkout to confirm it.");
      return;
    }

    (async () => {
      // Stripe may need a brief moment to finalize the Checkout session. Each
      // attempt still asks the server, never trusting the browser redirect.
      for (let attempt = 0; attempt < 6 && !cancelledRequest; attempt += 1) {
        try {
          const current = await confirmPrivateProject(projectId, sessionId);
          if (cancelledRequest) return;
          if (current.status === "active") {
            setProject(current);
            return;
          }
        } catch (err) {
          if (!cancelledRequest && attempt === 5) {
            setError(
              err instanceof Error
                ? err.message
                : "We couldn't confirm payment yet.",
            );
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelledRequest) {
        setError("Payment is still pending. Check the route's Share screen again shortly.");
      }
    })();

    return () => {
      cancelledRequest = true;
    };
  }, [cancelled, projectId, sessionId]);

  const shareLink = async () => {
    if (!project?.url) return;
    await Share.share({ message: project.url, url: project.url });
  };

  const returnToTracks = () => router.replace("/(tabs)/tracks");

  if (!project && !error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.mutedForeground }]}>
          Confirming secure payment…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.icon, { backgroundColor: colors.primary }]}>
          <Feather
            name={project ? "check" : "clock"}
            size={28}
            color={colors.primaryForeground}
          />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {project ? "Private project ready" : "Private project pending"}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {project
            ? "Your view-only project link is live for 180 days. You can send it to as many people as you need."
            : (error ?? "We are still confirming your payment.")}
        </Text>

        {project?.url ? (
          <Text
            selectable
            style={[
              styles.url,
              {
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {project.url}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {project ? (
          <Pressable
            onPress={shareLink}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="share-2" size={18} color={colors.primaryForeground} />
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
              Copy or share link
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={returnToTracks}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.foreground }]}>
            Back to routes
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loading: { fontFamily: "Inter_500Medium", fontSize: 15 },
  container: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
  content: { alignItems: "center", paddingTop: 48 },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, textAlign: "center" },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  url: {
    width: "100%",
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  actions: { gap: 12 },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});