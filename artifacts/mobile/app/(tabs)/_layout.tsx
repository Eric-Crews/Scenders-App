import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { scendersDesign as design } from "@/constants/scendersDesign";

const isIOS = Platform.OS === "ios";
const isWeb = Platform.OS === "web";

function TabIcon({
  name,
  color,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
}) {
  return <Feather name={name} size={21} color={color} />;
}

function RecordIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.recordIcon, focused && styles.recordIconFocused]}>
      <Feather
        name="navigation"
        size={19}
        color={focused ? design.color.black : design.color.text}
      />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: design.color.orangeBright,
        tabBarInactiveTintColor: design.color.textFaint,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : design.color.canvas,
          borderTopColor: design.color.line,
          borderTopWidth: 1,
          elevation: 0,
          paddingTop: 7,
          ...(isWeb ? { height: 84, paddingBottom: 10 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={96}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: design.color.canvas },
              ]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <TabIcon name="home" color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <TabIcon name="compass" color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Record",
          tabBarIcon: ({ focused }) => <RecordIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracks"
        options={{
          title: "Rides",
          tabBarIcon: ({ color }) => (
            <TabIcon name="activity" color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Saved",
          tabBarIcon: ({ color }) => (
            <TabIcon name="bookmark" color={color as string} />
          ),
        }}
      />
      <Tabs.Screen name="waypoints" options={{ href: null }} />
      <Tabs.Screen name="about" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.15,
  },
  tabItem: { paddingVertical: 1 },
  recordIcon: {
    alignItems: "center",
    backgroundColor: design.color.surfaceRaised,
    borderColor: design.color.lineStrong,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    marginTop: -11,
    width: 36,
  },
  recordIconFocused: {
    backgroundColor: design.color.orangeBright,
    borderColor: design.color.orangeBright,
  },
});
