import { mobileApiBase } from "./api-base";

export type GeocodedDestination = {
  lat: number;
  lng: number;
  label: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

export async function geocodeDestination(
  query: string,
): Promise<GeocodedDestination> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `${mobileApiBase()}/geocode?q=${encodeURIComponent(query.trim())}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & Partial<GeocodedDestination>;
    if (!response.ok) {
      throw new Error(payload.error || "Unable to resolve that destination.");
    }
    if (
      !Number.isFinite(payload.lat) ||
      !Number.isFinite(payload.lng) ||
      typeof payload.label !== "string"
    ) {
      throw new Error("Location search returned an invalid result.");
    }
    return payload as GeocodedDestination;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Location search timed out. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}