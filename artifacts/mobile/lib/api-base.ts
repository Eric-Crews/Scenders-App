/** Production-safe origin for native requests, even when Expo env injection is absent. */
export function mobileApiOrigin(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  return domain ? `https://${domain}` : "https://scenders.com";
}

/** Single transport base for every non-generated mobile request. */
export function mobileApiBase(): string {
  return `${mobileApiOrigin()}/api/mobile`;
}