import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Sheet } from "@/components/Sheet";
import { useColors } from "@/hooks/useColors";
import {
  BASE_LAYERS,
  BASE_LAYER_IDS,
  OVERLAY_LAYERS,
  OVERLAY_LAYER_IDS,
  type BaseLayerId,
  type OverlayLayerId,
} from "@/lib/mapLayers";

type Props = {
  visible: boolean;
  onClose: () => void;
  baseLayer: BaseLayerId;
  overlays: OverlayLayerId[];
  onSelectBase: (id: BaseLayerId) => void;
  onToggleOverlay: (id: OverlayLayerId) => void;
};

export function LayersSheet({
  visible,
  onClose,
  baseLayer,
  overlays,
  onSelectBase,
  onToggleOverlay,
}: Props) {
  const colors = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title="Map layers">
      <ScrollView
        style={{ maxHeight: 480 }}
        contentContainerStyle={{ gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>
            Base map
          </Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {BASE_LAYER_IDS.map((id) => {
              const config = BASE_LAYERS[id];
              const selected = baseLayer === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => onSelectBase(id)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {selected && (
                      <View
                        style={[
                          styles.radioDot,
                          { backgroundColor: colors.primaryForeground },
                        ]}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rowTitle,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {config.label}
                    </Text>
                    <Text
                      style={[
                        styles.rowSub,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                          opacity: selected ? 0.85 : 1,
                        },
                      ]}
                    >
                      {config.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>
            Overlays
          </Text>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            Terrain shading and free trail routes — overlay any combination on
            top of the base map.
          </Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {OVERLAY_LAYER_IDS.map((id) => {
              const config = OVERLAY_LAYERS[id];
              const selected = overlays.includes(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => onToggleOverlay(id)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: selected
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                        backgroundColor: selected
                          ? colors.primaryForeground
                          : "transparent",
                      },
                    ]}
                  >
                    {selected && (
                      <Feather name="check" size={14} color={colors.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rowTitle,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {config.label}
                    </Text>
                    <Text
                      style={[
                        styles.rowSub,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                          opacity: selected ? 0.85 : 1,
                        },
                      ]}
                    >
                      {config.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text
          style={[
            styles.attribution,
            { color: colors.mutedForeground, borderColor: colors.border },
          ]}
        >
          Tiles served by OpenStreetMap, OpenTopoMap, CyclOSM, Esri, and
          Waymarked Trails. Please respect each project's usage policy and
          consider donating.
        </Text>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  helper: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  attribution: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    fontStyle: "italic",
  },
});
