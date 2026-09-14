import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { scendersDesign } from "@/constants/scendersDesign";

type WordmarkProps = {
  compact?: boolean;
};

export function ScendersWordmark({ compact = false }: WordmarkProps) {
  return (
    <View style={styles.wordmark} accessibilityLabel="Scenders">
      <Image
        source={require("../assets/images/scenders-s-badge.png")}
        style={[styles.logo, compact && styles.logoCompact]}
        contentFit="contain"
      />
      <View style={styles.brandContainer}>
        <Text style={[styles.brand, compact && styles.brandCompact]}>
          Scenders
        </Text>
        <View style={styles.brandUnderline} />
      </View>
    </View>
  );
}

export function ScendersMoreButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel="Open settings and more"
      accessibilityRole="button"
      onPress={() => router.push("/about")}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        pressed && styles.pressed,
      ]}
    >
      <Feather name="menu" size={20} color={scendersDesign.color.text} />
    </Pressable>
  );
}

export function ScendersHeader() {
  return (
    <View style={styles.header}>
      <ScendersWordmark />
      <ScendersMoreButton />
    </View>
  );
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ScendersSectionHeading({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: SectionHeadingProps) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionTitleWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headingAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.headingActionText}>{actionLabel}</Text>
          <Feather
            name="chevron-right"
            size={16}
            color={scendersDesign.color.orangeBright}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  headerButton: {
    alignItems: "center",
    backgroundColor: scendersDesign.color.surface,
    borderColor: scendersDesign.color.line,
    borderRadius: 99,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  wordmark: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  logo: {
    height: 32,
    width: 32,
  },
  logoCompact: {
    height: 26,
    width: 26,
  },
  brandContainer: {
    alignItems: "flex-start",
  },
  brand: {
    color: scendersDesign.color.white,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    fontStyle: "italic",
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  brandCompact: {
    fontSize: 18,
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  brandUnderline: {
    backgroundColor: scendersDesign.color.orangeBright,
    height: 3,
    width: "100%",
    marginTop: 1,
    borderRadius: 2,
  },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitleWrap: { flex: 1 },
  eyebrow: {
    color: scendersDesign.color.textFaint,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: scendersDesign.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 19,
    letterSpacing: -0.4,
    lineHeight: 23,
  },
  headingAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    paddingBottom: 2,
  },
  headingActionText: {
    color: scendersDesign.color.orangeBright,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  pressed: { opacity: 0.65 },
});
