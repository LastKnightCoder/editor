// Mood ID to color mapping
export const MOOD_COLOR_MAP: Record<string, string> = {
  "party-popper": "#faad14", // 超开心 - 橙黄色
  "smiling-face-with-heart-eyes": "#eb2f96", // 爱心 - 粉红色
  "smiling-face": "#52c41a", // 微笑 - 绿色
  "slightly-smiling-face": "#95de64", // 轻微笑 - 浅绿色
  "neutral-face": "#d9d9d9", // 平静 - 灰色
  "downcast-face-with-sweat": "#8c8c8c", // 沮丧 - 深灰色
  "thumbs-down": "#ff4d4f", // 不好 - 红色
  "sleeping-face": "#597ef7", // 困倦 - 蓝色
  "thumbs-up": "#52c41a", // 不错 - 绿色
};

/**
 * Get mood color from stored mood value
 */
export const getMoodColor = (mood: string | null): string => {
  if (!mood) return "#f5f5f5"; // default gray

  try {
    const moodObj = typeof mood === "string" ? JSON.parse(mood) : mood;
    const moodId = moodObj.value;

    return MOOD_COLOR_MAP[moodId] || "#f5f5f5";
  } catch (e) {
    console.error("Error parsing mood value:", e);
    return "#f5f5f5";
  }
};

/**
 * Convert hex color to rgba
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
