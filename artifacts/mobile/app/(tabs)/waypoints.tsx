import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Sheet } from "@/components/Sheet";
import { useMaps } from "@/contexts/MapsContext";
import { useColors } from "@/hooks/useColors";
import type { Waypoint } from "@/lib/types";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;
const WEB_BOTTOM_INSET = Platform.OS === "web" ? 84 : 0;

export default function WaypointsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { waypoints, removeWaypoint } = useMaps();

  const [selected, setSelected] = useState<Waypoint | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const openDetail = (w: Waypoint) => {
    setImageLoading(!!w.photoUri);
    setSelected(w);
  };

  const confirmRemove = (w: Waypoint) => {
    Alert.alert("Remove waypoint?", `“${w.name}” will be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeWaypoint(w.id),
      },
    ]);
  };

  const renderItem = ({ item }: { item: Waypoint }) => (
    <Pressable
      onPress={() => openDetail(item)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {item.photoUri ? (
        <Image source={{ uri: item.photoUri }} style={styles.thumb} />
      ) : (
        <View
          style={[
            styles.pin,
            {
              backgroundColor: item.trackId ? colors.primary : colors.accent,
            },
          ]}
        >
          <Feather name="map-pin" size={16} color="#fff" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.cardTitle,
              { color: colors.foreground, flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.trackId ? (
            <View
              style={[styles.trackBadge, { backgroundColor: colors.secondary }]}
            >
              <Feather name="activity" size={10} color={colors.foreground} />
              <Text
                style={[styles.trackBadgeText, { color: colors.foreground }]}
              >
                track
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
          {item.latitude.toFixed(5)}°, {item.longitude.toFixed(5)}°
        </Text>
        {item.notes ? (
          <Text
            style={[styles.cardNotes, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {item.notes}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => confirmRemove(item)}
        hitSlop={10}
        style={({ pressed: p }) => [styles.iconBtn, { opacity: p ? 0.6 : 1 }]}
      >
        <Feather name="trash-2" size={18} color={colors.destructive} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + WEB_TOP_INSET + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
            SCENDERS
          </Text>
          <Text style={[styles.h1, { color: colors.foreground }]}>
            Waypoints
          </Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.countText, { color: colors.foreground }]}>
            {waypoints.length}
          </Text>
        </View>
      </View>

      <FlatList
        data={waypoints}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + WEB_BOTTOM_INSET + 96,
          gap: 10,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="map-pin" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No waypoints yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Long-press anywhere on the map to drop a waypoint and capture
              notes from the field.
            </Text>
            <Pressable
              onPress={() => router.push("/map")}
              style={({ pressed }) => [
                styles.emptyBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="map" size={16} color={colors.primaryForeground} />
              <Text
                style={[
                  styles.emptyBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Open map
              </Text>
            </Pressable>
          </View>
        }
      />

      <Sheet
        visible={selected !== null}
        onClose={() => {
          setFullscreen(false);
          setSelected(null);
        }}
        title={selected?.name}
      >
        {selected ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 14 }}
          >
            {selected.photoUri ? (
              <Pressable
                onPress={() => setFullscreen(true)}
                style={[
                  styles.detailPhotoWrap,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Image
                  source={{ uri: selected.photoUri }}
                  style={styles.detailPhoto}
                  resizeMode="cover"
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                />
                {imageLoading ? (
                  <View style={styles.detailPhotoLoader}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <View style={styles.expandHint}>
                    <Feather name="maximize-2" size={14} color="#fff" />
                  </View>
                )}
              </Pressable>
            ) : null}

            <View style={styles.detailRow}>
              <Feather
                name="map-pin"
                size={16}
                color={colors.mutedForeground}
              />
              <Text style={[styles.detailText, { color: colors.foreground }]}>
                {selected.latitude.toFixed(5)}°, {selected.longitude.toFixed(5)}
                °
              </Text>
            </View>

            {selected.trackId ? (
              <View style={styles.detailRow}>
                <Feather
                  name="activity"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text style={[styles.detailText, { color: colors.foreground }]}>
                  Recorded on a track
                </Text>
              </View>
            ) : null}

            {selected.notes ? (
              <Text style={[styles.detailNotes, { color: colors.foreground }]}>
                {selected.notes}
              </Text>
            ) : null}

            <Pressable
              onPress={() => {
                setFullscreen(false);
                setSelected(null);
                router.push("/map");
              }}
              style={({ pressed }) => [
                styles.detailBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="map" size={16} color={colors.primaryForeground} />
              <Text
                style={[
                  styles.detailBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Show on map
              </Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </Sheet>

      <Modal
        visible={fullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.fullscreenBackdrop}
          onPress={() => setFullscreen(false)}
        >
          {selected?.photoUri ? (
            <Image
              source={{ uri: selected.photoUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setFullscreen(false)}
            hitSlop={12}
            style={[styles.fullscreenClose, { top: insets.top + 12 }]}
          >
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  kicker: { fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.4 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 30, marginTop: 2 },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 38,
    alignItems: "center",
  },
  countText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#ddd",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trackBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.4,
  },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardMeta: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  cardNotes: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
  iconBtn: { padding: 8 },
  detailPhotoWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 14,
    overflow: "hidden",
  },
  detailPhoto: { width: "100%", height: "100%" },
  detailPhotoLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  expandHint: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  detailNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 2,
  },
  detailBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: { width: "100%", height: "100%" },
  fullscreenClose: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  empty: {
    paddingVertical: 56,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, marginTop: 4 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
