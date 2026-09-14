/**
 * Scenders' product UI foundation.
 *
 * New screens should use these tokens instead of introducing one-off dark
 * colors. The legacy light palette remains available through useColors while
 * the rest of the app is migrated screen by screen.
 */
export const scendersDesign = {
  color: {
    canvas: "#090909",
    surface: "#141414",
    surfaceRaised: "#1B1B1B",
    surfacePressed: "#232323",
    line: "#2C2C2C",
    lineStrong: "#3B3B3B",
    text: "#F7F4EF",
    textMuted: "#A7A29B",
    textFaint: "#75716C",
    orange: "#D2691E",
    orangeBright: "#F28A3B",
    orangeSoft: "#F3D5C0",
    success: "#75A77C",
    warning: "#D9A441",
    danger: "#D85B4C",
    black: "#000000",
    white: "#FFFFFF",
  },
  radius: {
    small: 10,
    medium: 14,
    large: 18,
    hero: 22,
    pill: 999,
  },
  space: {
    xsmall: 6,
    small: 10,
    medium: 16,
    large: 22,
    xlarge: 30,
  },
} as const;

export type ScendersDesign = typeof scendersDesign;
