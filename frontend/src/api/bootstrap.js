// API mode: load the reference data the app keeps in memory (categories, stores, public catalogue, ads, platform
// settings) from the backend and put it into the same live arrays the mock database used, so components that
// read @/data synchronously (menus, store cards, cart view) show server data. Call refreshCatalog() after admin
// or seller changes to categories, products, stores or ads.
import { API, axiosInstance, IS_MOCK } from "@/config";
import { ADS, AD_SLOTS, CATEGORIES, PLATFORM, PRODUCTS, STORES } from "@/data";

const replace = (target, items) => { target.splice(0, target.length, ...(items ?? [])); };
export const SERVER = { announcement: null };

export async function refreshCatalog() {
  if (IS_MOCK) return;
  const { data } = await axiosInstance.get(API.BOOTSTRAP);
  replace(CATEGORIES, data.categories);
  replace(STORES, data.stores);
  replace(PRODUCTS, data.products);
  replace(ADS, data.ads);
  replace(AD_SLOTS, data.adSlots);
  Object.keys(PLATFORM).forEach((k) => delete PLATFORM[k]);
  Object.assign(PLATFORM, data.platform);
  SERVER.announcement = data.announcement;
}
