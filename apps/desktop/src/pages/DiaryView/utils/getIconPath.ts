import { WEATHER_ICONS, MOOD_ICONS } from "../constants/icons";

// 使用 ?raw 导入 SVG 原始内容，以便处理 currentColor
const weatherIconModules = import.meta.glob<string>(
  "../../../assets/weather-icons/*.svg",
  { eager: true, query: '?raw', import: 'default' }
);

// PNG 图标继续使用默认导入
const moodIconModules = import.meta.glob<{ default: string }>(
  "../../../assets/mood/*.png",
  { eager: true }
);

// 创建路径映射缓存
const weatherIconCache = new Map<string, string>();
const moodIconCache = new Map<string, string>();

// 初始化天气图标缓存 - 将 SVG 转换为 data URL，并替换 currentColor
Object.entries(weatherIconModules).forEach(([path, svgContent]) => {
  const match = path.match(/([^/\\]+)\.svg$/);
  const fileName = match ? match[1] : "";

  if (fileName && svgContent) {
    // 替换 currentColor 为黑色，因为 mask 只关心形状
    const processedSvg = svgContent.replace(/fill="currentColor"/g, 'fill="black"');
    // 创建 data URL
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(processedSvg)}`;
    weatherIconCache.set(fileName, dataUrl);
  }
});

// 初始化心情图标缓存
Object.entries(moodIconModules).forEach(([path, module]) => {
  const match = path.match(/([^/\\]+)$/);
  const fileName = match ? match[1] : "";
  const url = module.default;

  if (fileName && url) {
    moodIconCache.set(fileName, url);
  }
});

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

      return weatherIconCache.get(iconId) || null;
    } else {
      const icon = MOOD_ICONS.find((i) => i.id === iconId);
      if (!icon) return null;

      const fileName = isDisabled ? icon.disabledIcon : icon.icon;
      return moodIconCache.get(fileName) || null;
    }
  } catch (e) {
    console.error("Error parsing icon value:", e);
    return null;
  }
};
