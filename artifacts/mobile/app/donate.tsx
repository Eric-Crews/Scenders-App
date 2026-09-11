import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { createDonationCheckout } from "@/lib/community";

const PRESETS = [5, 10, 20, 50];
const MIN_USD = 1;
const MAX_USD = 100_000;

export default function DonateScreen() {
  const colors = useColors();
  const router = useRouter();
  const { amount: selectedAmount } = useLocalSearchParams<{ amount?: string }>();

  const [amount, setAmount] = useState(selectedAmount ?? "10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const donate = async () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < MIN_USD) {
      setError(`Please enter an amount of at least $${MIN_USD}.`);
      return;
    }
    if (dollars > MAX_USD) {
      setError(`Please enter an amount no greater than $${MAX_USD.toLocaleString()}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { url } = await createDonationCheckout(Math.round(dollars * 100));
      await Linking.openURL(url);
      // Pop back so the donor returns to the app rather than this form.
      if (router.canGoBack()) router.back();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't start checkout. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.heroCard,
            { backgroundColor: colors.primary },
          ]}
        >
          <Feather name="heart" size={26} color={colors.primaryForeground} />
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>
            Keep the maps free
          </Text>
          <Text style={[styles.heroBody, { color: colors.primaryForeground }]}>
            mapper.one is free, open, and built on the shoulders of the
            open-data community. If it&rsquo;s earned a place in your pack, chip
            in whatever it&rsquo;s worth to you — one time, no subscription.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Choose an amount
          </Text>
          <View style={styles.presets}>
            {PRESETS.map((p) => {
              const active = Number(amount) === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    setAmount(String(p));
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.preset,
                    {
                      backgroundColor: active ? colors.primary : "transparent",
                      borderColor: active ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      {
                        color: active
                          ? colors.primaryForeground
                          : colors.foreground,
                      },
                    ]}
                  >
                    ${p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.amountRow}>
            <Text style={[styles.dollar, { color: colors.mutedForeground }]}>
              $
            </Text>
            <TextInput
              value={amount}
              onChangeText={(t) => {
                setAmount(t);
                setError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="Custom amount"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.amountInput,
                { color: colors.foreground, borderColor: colors.border },
              ]}
            />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={donate}
            disabled={submitting}
            style={({ pressed }) => [
              styles.donateBtn,
              {
                backgroundColor: colors.primary,
                opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather
                  name="heart"
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.donateBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Donate
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.fine, { color: colors.mutedForeground }]}>
            Secure one-time payment via Stripe in your browser. mapper.one never
            sees your card details.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heroCard: { borderRadius: 18, padding: 20, gap: 10 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 19, lineHeight: 25 },
  heroBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  presets: { flexDirection: "row", gap: 8 },
  preset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  amountRow: { flexDirection: "row", alignItems: "center" },
  dollar: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingLeft: 30,
    paddingRight: 14,
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  error: { fontFamily: "Inter_500Medium", fontSize: 13 },
  donateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 999,
  },
  donateBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  fine: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
