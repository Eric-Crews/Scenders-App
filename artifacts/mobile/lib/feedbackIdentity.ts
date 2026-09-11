import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const CLIENT_ID_KEY = "mapper.one/feedback-client-id";
const DISPLAY_NAME_KEY = "mapper.one/feedback-display-name";

// A stable per-device anonymous id used to dedupe upvotes without any login.
export async function getClientId(): Promise<string> {
  let id = await AsyncStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export async function getDisplayName(): Promise<string> {
  return (await AsyncStorage.getItem(DISPLAY_NAME_KEY)) ?? "";
}

export async function setDisplayName(name: string): Promise<void> {
  await AsyncStorage.setItem(DISPLAY_NAME_KEY, name);
}
