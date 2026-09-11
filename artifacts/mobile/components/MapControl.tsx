import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
  testID?: string;
};

export function MapControl({ onPress, active, children, testID }: Props) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: active ? colors.primary : colors.background,
          opacity: pressed ? 0.75 : 1,
          shadowColor: "#000",
        },
      ]}
    >
      <View>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
