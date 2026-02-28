import type { HighlightColor, PageHighlights } from "./types";
import { DEFAULT_COLOR, HIGHLIGHT_COLORS, STORAGE_KEY_PREFIX } from "./types";

const LAST_SELECTED_COLOR_KEY = "tau-highlighter-last-selected-color";

function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && value in HIGHLIGHT_COLORS;
}

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

export async function getLastSelectedColor(): Promise<HighlightColor> {
  try {
    const result = await chrome.storage.local.get(LAST_SELECTED_COLOR_KEY);
    const color = result[LAST_SELECTED_COLOR_KEY];
    return isHighlightColor(color) ? color : DEFAULT_COLOR;
  } catch {
    return DEFAULT_COLOR;
  }
}

export async function saveLastSelectedColor(
  color: HighlightColor,
): Promise<void> {
  try {
    await chrome.storage.local.set({ [LAST_SELECTED_COLOR_KEY]: color });
  } catch {
    // ignore storage error
  }
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
