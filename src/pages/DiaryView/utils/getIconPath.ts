import { WEATHER_ICONS, MOOD_ICONS } from "../constants/icons";

/**
 * Get the icon path for weather or mood
 * @param value - The stored value (JSON string or object)
 * @param type - 'weather' or 'mood'
 * @param isDisabled - For mood icons, whether to get the disabled version
 * @returns The icon path or null
 */
export const getIconPath = (
  value: string | null,
  type: "weather" | "mood",
  isDisabled = false,
): string | null => {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const iconId = parsed.value;

    if (type === "weather") {
      const icon = WEATHER_ICONS.find((i) => i.id === iconId);
      if (!icon) return null;

      // 从本地 assets 目录加载图标
      return new URL(
        `../../../assets/weather-icons/${iconId}.svg`,
        import.meta.url,
      ).href;
    } else {
      const icon = MOOD_ICONS.find((i) => i.id === iconId);
      if (!icon) return null;

      const fileName = isDisabled ? icon.disabledIcon : icon.icon;
      return new URL(`../../../assets/mood/${fileName}`, import.meta.url).href;
    }
  } catch (e) {
    console.error("Error parsing icon value:", e);
    return null;
  }
};
