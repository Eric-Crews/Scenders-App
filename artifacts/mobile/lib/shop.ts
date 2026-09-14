import { customFetch } from "./api-client/custom-fetch";
import { mobileApiBase } from "./api-base";

export type MobileShopDeal = {
  id: string;
  name: string;
  brand: string | null;
  image: string;
  price: number;
  compareAtPrice: number | null;
  savings: number | null;
  url: string;
};

export type MobileShopAccess = {
  eligible: boolean;
  url: string;
};

export async function listMobileShopDeals(): Promise<MobileShopDeal[]> {
  const response = await fetch(`${mobileApiBase()}/shop-deals?limit=6`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Deals are temporarily unavailable");
  const payload = await response.json() as { deals?: MobileShopDeal[] };
  return Array.isArray(payload.deals) ? payload.deals : [];
}

export function getMobileShopAccess(): Promise<MobileShopAccess> {
  return customFetch<MobileShopAccess>("/api/shop-access", {
    responseType: "json",
  });
}