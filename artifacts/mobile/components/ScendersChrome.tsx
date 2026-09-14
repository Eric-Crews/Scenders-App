import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { scendersDesign } from "@/constants/scendersDesign";

type WordmarkProps = {
  compact?: boolean;
};

export function ScendersWordmark({ compact = false }: WordmarkProps) {
  return (
    <View style={styles.wordmark} accessibilityLabel="Scenders Ride">
      <Image
        source={require("../assets/images/icon.png")}
        style={[styles.logo, compact && styles.logoCompact]}
        contentFit="cover"
      />
      <View>
        <Text style={[styles.brand, compact && styles.brandCompact]}>
          SCENDERS
        </Text>
        {!compact ? <Text style={styles.product}>RIDE</Text> : null}
      </View>
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
            name="arrow-up-right"
            size={15}
            color={scendersDesign.color.orangeBright}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  logo: {
    borderRadius: 10,
    height: 38,
    width: 38,
  },
  logoCompact: {
    borderRadius: 8,
    height: 30,
    width: 30,
  },
  brand: {
    color: scendersDesign.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 2.4,
    lineHeight: 18,
  },
  brandCompact: {
    fontSize: 15,
    letterSpacing: 2,
    lineHeight: 17,
  },
  product: {
    color: scendersDesign.color.orangeBright,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 3.8,
    lineHeight: 12,
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
    fontSize: 9,
    letterSpacing: 1.7,
    marginBottom: 5,
  },
  sectionTitle: {
    color: scendersDesign.color.text,
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    letterSpacing: -0.45,
    lineHeight: 25,
  },
  headingAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingBottom: 2,
  },
  headingActionText: {
    color: scendersDesign.color.orangeBright,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  pressed: { opacity: 0.65 },
});
