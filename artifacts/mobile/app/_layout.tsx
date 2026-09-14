import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useCallback, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { scendersDesign } from "@/constants/scendersDesign";
import { MapsProvider } from "@/contexts/MapsContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { AuthProvider } from "@/lib/auth";
import { setAuthTokenGetter, setBaseUrl } from "@/lib/api-client";
import { mobileApiOrigin } from "@/lib/api-base";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const AUTH_TOKEN_KEY = "auth_session_token";

setBaseUrl(mobileApiOrigin());
setAuthTokenGetter(() => SecureStore.getItemAsync(AUTH_TOKEN_KEY));

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="rides/[slug]" options={{ headerShown: false }} />
      <Stack.Screen name="discussions" options={{ title: "Discussions" }} />
      <Stack.Screen
        name="donate"
        options={{ title: "Support Scenders" }}
      />
      <Stack.Screen name="share/[token]" options={{ title: "Shared route" }} />
      <Stack.Screen
        name="share-complete"
        options={{ title: "Private project" }}
      />
      <Stack.Screen name="projects" options={{ title: "Projects" }} />
    </Stack>
  );
}

function BootSplash() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: scendersDesign.color.canvas,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={require("../assets/images/scenders-s-badge.png")}
        style={{ width: 120, height: 120 }}
        contentFit="contain"
        onLoad={async () => {
          await SplashScreen.hideAsync();
        }}
      />
      <ActivityIndicator
        color={scendersDesign.color.orangeBright}
        size="large"
        style={{ position: "absolute", bottom: "15%" }}
      />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (Platform.OS !== "web" && !fontsLoaded && !fontError) {
    return <BootSplash />;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <MapsProvider>
                  <RecordingProvider>
                    <RootLayoutNav />
                  </RecordingProvider>
                </MapsProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
