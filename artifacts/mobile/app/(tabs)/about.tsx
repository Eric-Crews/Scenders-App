import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMaps } from "@/contexts/MapsContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { createDonationCheckout } from "@/lib/community";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;
const DONATION_PRESETS = [5, 10, 20, 50];
const MIN_DONATION_USD = 1;
const MAX_DONATION_USD = 100_000;

type LinkRowProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  sub?: string;
  href?: string;
  onPress?: () => void;
};

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, login, logout, deleteAccount } =
    useAuth();
  const { syncStatus, settings, updateSettings } = useMaps();
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [donationAmount, setDonationAmount] = React.useState("5");
  const [donating, setDonating] = React.useState(false);
  const [donationError, setDonationError] = React.useState<string | null>(null);

  const open = (href?: string) => {
    if (!href) return;
    Linking.openURL(href).catch(() => {});
  };

  const startDonation = async () => {
    const dollars = Number(donationAmount);
    if (!Number.isFinite(dollars) || dollars < MIN_DONATION_USD) {
      setDonationError(`Please enter at least $${MIN_DONATION_USD}.`);
      return;
    }
    if (dollars > MAX_DONATION_USD) {
      setDonationError(
        `Please enter no more than $${MAX_DONATION_USD.toLocaleString()}.`,
      );
      return;
    }

    setDonationError(null);
    setDonating(true);
    try {
      const { url } = await createDonationCheckout(Math.round(dollars * 100));
      await Linking.openURL(url);
    } catch (error) {
      setDonationError(
        error instanceof Error
          ? error.message
          : "Couldn't start secure checkout. Please try again.",
      );
    } finally {
      setDonating(false);
    }
  };

  const confirmAccountDeletion = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account and cloud-synced maps, routes, waypoints, offline regions, and private projects. Maps stored only on this device will remain until you remove them or uninstall the app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount();
              Alert.alert(
                "Account deleted",
                "Your account and cloud-synced data have been deleted.",
              );
            } catch (error) {
              Alert.alert(
                "Couldn’t delete account",
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  const LinkRow = ({ icon, label, sub, href, onPress }: LinkRowProps) => (
    <Pressable
      onPress={() => (onPress ? onPress() : open(href))}
      disabled={!href && !onPress}
      style={({ pressed }) => [
        styles.linkRow,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed && (href || onPress) ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        {sub ? (
          <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {href ? (
        <Feather
          name="external-link"
          size={16}
          color={colors.mutedForeground}
        />
      ) : onPress ? (
        <Feather
          name="chevron-right"
          size={18}
          color={colors.mutedForeground}
        />
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
        contentContainerStyle={{
          paddingTop: insets.top + WEB_TOP_INSET + 12,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 96,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
            SCENDERS
          </Text>
          <Text style={[styles.h1, { color: colors.foreground }]}>More</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Route tools for mountain-bike and gravel days.
          </Text>
        </View>

        <View
          style={[
            styles.supportCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.accountHeader}>
            <Feather name="heart" size={18} color={colors.primary} />
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>
              Keep Scenders Ride moving
            </Text>
          </View>
          <Text style={[styles.accountBody, { color: colors.mutedForeground }]}>
            One-time contributions help support free, offline-first route tools.
            Secure payment is handled by Stripe in your browser.
          </Text>
          <View style={styles.donationPresets}>
            {DONATION_PRESETS.map((amount) => {
              const isSelected = Number(donationAmount) === amount;
              return (
                <Pressable
                  key={amount}
                  testID={`donation-preset-${amount}`}
                  onPress={() => {
                    setDonationAmount(String(amount));
                    setDonationError(null);
                  }}
                  style={({ pressed }) => [
                    styles.donationPreset,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : colors.muted,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.donationPresetText,
                      {
                        color: isSelected
                          ? colors.primaryForeground
                          : colors.primary,
                      },
                    ]}
                  >
                    ${amount}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.donationAmountRow}>
            <Text
              style={[styles.donationDollar, { color: colors.mutedForeground }]}
            >
              $
            </Text>
            <TextInput
              testID="donation-custom-amount"
              value={donationAmount}
              onChangeText={(value) => {
                setDonationAmount(value);
                setDonationError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="Another amount"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.donationAmountInput,
                { color: colors.foreground, borderColor: colors.border },
              ]}
            />
          </View>
          {donationError ? (
            <Text
              testID="donation-error"
              style={[styles.donationError, { color: colors.destructive }]}
            >
              {donationError}
            </Text>
          ) : null}
          <Pressable
            testID="donation-checkout"
            onPress={startDonation}
            disabled={donating}
            style={({ pressed }) => [
              styles.donationCheckoutButton,
              {
                backgroundColor: colors.primary,
                opacity: donating ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {donating ? (
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
                    styles.donationCheckoutText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Donate securely
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View
          style={[
            styles.accountCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.accountHeader}>
            <Feather name="user" size={18} color={colors.primary} />
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>
              Account
            </Text>
          </View>
          {isAuthenticated && user ? (
            <>
              <Text
                style={[styles.accountBody, { color: colors.mutedForeground }]}
              >
                Signed in as{" "}
                <Text style={{ color: colors.foreground }}>
                  {user.firstName || user.email || user.id}
                </Text>
                . Your waypoints, datasets, regions, and tracks sync to the
                cloud automatically.
              </Text>
              <Pressable
                onPress={() => router.push("/projects")}
                style={({ pressed }) => [
                  styles.linkBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather
                  name="map-pin"
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.linkBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Open projects
                </Text>
              </Pressable>
              {syncStatus !== "idle" && (
                <Text
                  style={[styles.syncStatus, { color: colors.mutedForeground }]}
                >
                  {syncStatus === "syncing"
                    ? "Syncing…"
                    : "Sync error — sign out and back in to retry."}
                </Text>
              )}
              <Pressable
                onPress={() => {
                  logout().catch(() => {});
                }}
                style={({ pressed }) => [
                  styles.linkBtn,
                  {
                    backgroundColor: colors.muted,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather name="log-out" size={16} color={colors.primary} />
                <Text style={[styles.linkBtnText, { color: colors.primary }]}>
                  Sign out
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmAccountDeletion}
                disabled={deletingAccount}
                style={({ pressed }) => [
                  styles.linkBtn,
                  {
                    backgroundColor: colors.destructive + "12",
                    opacity: deletingAccount ? 0.55 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather name="trash-2" size={16} color={colors.destructive} />
                <Text
                  style={[styles.linkBtnText, { color: colors.destructive }]}
                >
                  {deletingAccount ? "Deleting account…" : "Delete account"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={[styles.accountBody, { color: colors.mutedForeground }]}
              >
                Sign in to back up your maps, waypoints, offline regions, and
                tracks across devices. Everything still works offline — sync
                runs in the background.
              </Text>
              <Pressable
                onPress={() => {
                  login().catch(() => {});
                }}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: isLoading ? 0.5 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Feather
                  name="log-in"
                  size={16}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Sign in
                </Text>
              </Pressable>
            </>
          )}
          <LinkRow
            icon="shield"
            label="Account deletion information"
            sub="Review what is deleted and request account removal"
            href="https://mapper.one/delete-account"
          />
          <LinkRow
            icon="database"
            label="Delete selected data"
            sub="Remove cloud data without deleting your account"
            href="https://mapper.one/delete-data"
          />
        </View>

        <View
          style={[
            styles.accountCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.accountHeader}>
            <Feather name="sliders" size={18} color={colors.primary} />
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>
              Preferences
            </Text>
          </View>
          <Text style={[styles.accountBody, { color: colors.mutedForeground }]}>
            Distance units
          </Text>
          <View style={[styles.segment, { borderColor: colors.border }]}>
            {(
              [
                { value: "metric", label: "Kilometers" },
                { value: "imperial", label: "Miles" },
              ] as const
            ).map((opt) => {
              const active = settings.units === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => updateSettings({ units: opt.value })}
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    {
                      backgroundColor: active ? colors.primary : "transparent",
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color: active
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <Feather name="compass" size={28} color={colors.primaryForeground} />
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>
            Standing on the shoulders of giants
          </Text>
          <Text style={[styles.heroBody, { color: colors.primaryForeground }]}>
            Every trail we follow was first cut by someone else. Every map we
            read was first drawn by hand. Scenders Ride exists because of the
            riders, trail builders, cartographers, and open-data communities who
            came before — and we&rsquo;re grateful for all of them.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          Built by
        </Text>
        <View
          style={[
            styles.creditCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.creditTitle, { color: colors.foreground }]}>
            The team behind The Adventure Collective
          </Text>
          <Text style={[styles.creditBody, { color: colors.mutedForeground }]}>
            We&rsquo;re riders and explorers of wild places — singletrack,
            gravel, alpine ridges, and quiet roads. We made Scenders Ride to put
            practical route tools in the hands of people who actually go out
            there.
          </Text>
          <Pressable
            onPress={() => open("https://advcollective.com")}
            style={({ pressed }) => [
              styles.linkBtn,
              {
                backgroundColor: colors.muted,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name="globe" size={16} color={colors.primary} />
            <Text style={[styles.linkBtnText, { color: colors.primary }]}>
              TheAdventureCollective.com
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          Community values
        </Text>
        <View style={styles.values}>
          <View
            style={[
              styles.valueCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="unlock" size={18} color={colors.primary} />
            <Text style={[styles.valueTitle, { color: colors.foreground }]}>
              Built for the field
            </Text>
            <Text style={[styles.valueBody, { color: colors.mutedForeground }]}>
              Clear, practical mapping tools for carrying routes, waypoints, and
              field notes into the places where work happens.
            </Text>
          </View>
          <View
            style={[
              styles.valueCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="users" size={18} color={colors.primary} />
            <Text style={[styles.valueTitle, { color: colors.foreground }]}>
              Community-built
            </Text>
            <Text style={[styles.valueBody, { color: colors.mutedForeground }]}>
              Pull requests welcome. File a route, fix a bug, or share an idea —
              the map gets better when we build it together.
            </Text>
          </View>
          <View
            style={[
              styles.valueCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="wifi-off" size={18} color={colors.primary} />
            <Text style={[styles.valueTitle, { color: colors.foreground }]}>
              Offline by default
            </Text>
            <Text style={[styles.valueBody, { color: colors.mutedForeground }]}>
              Save a region before you leave the trailhead. Your phone keeps the
              map even when the cell tower can&rsquo;t.
            </Text>
          </View>
          <View
            style={[
              styles.valueCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="heart" size={18} color={colors.primary} />
            <Text style={[styles.valueTitle, { color: colors.foreground }]}>
              Credit where it&rsquo;s due
            </Text>
            <Text style={[styles.valueBody, { color: colors.mutedForeground }]}>
              Map tiles ©{" "}
              <Text
                onPress={() => open("https://www.openstreetmap.org/copyright")}
                style={{ color: colors.primary }}
              >
                OpenStreetMap contributors
              </Text>
              . Rendered with{" "}
              <Text
                onPress={() => open("https://leafletjs.com")}
                style={{ color: colors.primary }}
              >
                Leaflet
              </Text>
              .
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          Get involved
        </Text>
        <View style={{ gap: 10 }}>
          <LinkRow
            icon="map-pin"
            label="Waypoints"
            sub="Save field notes and places along the route"
            onPress={() => router.push("/(tabs)/waypoints")}
          />
          <Pressable
            onPress={() => router.push("/discussions")}
            style={({ pressed }) => [
              styles.linkRow,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.muted }]}>
              <Feather name="message-circle" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: colors.foreground }]}>
                Community discussions
              </Text>
              <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
                Share feedback, request features, upvote ideas
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
          <LinkRow
            icon="mail"
            label="Reach out"
            sub="info@advcollective.com"
            href="mailto:info@advcollective.com"
          />
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Scenders Ride · Find the line worth riding.{"\n"}
          Part of The Adventure Collective.
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { marginBottom: 20 },
  kicker: { fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.4 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 2 },
  tagline: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 18,
    padding: 20,
    gap: 10,
    marginBottom: 28,
  },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 19, lineHeight: 25 },
  heroBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  creditCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 28,
  },
  creditTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  creditBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 4,
  },
  linkBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  accountCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 18,
  },
  supportCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 18,
  },
  accountHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  accountTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  accountBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  syncStatus: { fontFamily: "Inter_500Medium", fontSize: 12 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  donationPresets: { flexDirection: "row", gap: 8 },
  donationPreset: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
  },
  donationPresetText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  donationAmountRow: { flexDirection: "row", alignItems: "center" },
  donationDollar: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    left: 14,
    position: "absolute",
    zIndex: 1,
  },
  donationAmountInput: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    paddingLeft: 30,
    paddingRight: 14,
    paddingVertical: 12,
  },
  donationError: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  donationCheckoutButton: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 12,
  },
  donationCheckoutText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 999,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 999,
  },
  segmentText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  values: { gap: 10, marginBottom: 28 },
  valueCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  valueTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginTop: 2,
  },
  valueBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  linkSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 28,
  },
});
