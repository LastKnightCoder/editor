import type { PageHighlights } from "./types";
import { STORAGE_KEY_PREFIX } from "./types";

function getStorageKey(url: string): string {
  // Normalize URL by removing hash
  const normalized = url.split("#")[0];
  return `${STORAGE_KEY_PREFIX}${normalized}`;
}

export async function getPageHighlights(
  url: string,
): Promise<PageHighlights | null> {
  const key = getStorageKey(url);
  const result = await chrome.storage.local.get(key);
  return (result[key] as PageHighlights) ?? null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingData: PageHighlights | null = null;

export async function savePageHighlights(data: PageHighlights): Promise<void> {
  pendingData = data;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!pendingData) return;
    const key = getStorageKey(pendingData.url);
    await chrome.storage.local.set({ [key]: pendingData });
    pendingData = null;
    saveTimer = null;
  }, 500);
}

export async function savePageHighlightsImmediate(
  data: PageHighlights,
): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingData = null;
  const key = getStorageKey(data.url);
  await chrome.storage.local.set({ [key]: data });
}
