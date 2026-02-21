export type TextGradientPresetId =
  | "sunset"
  | "ocean"
  | "forest"
  | "violet"
  | "gold"
  | "rose";

export interface TextGradientPreset {
  id: TextGradientPresetId;
  label: string;
  light: string;
  dark: string;
  fallbackLight: string;
  fallbackDark: string;
}

export interface ResolvedTextGradientStyle {
  gradient: string;
  fallbackColor: string;
}

export const TEXT_GRADIENT_PRESETS: Record<
  TextGradientPresetId,
  TextGradientPreset
> = {
  sunset: {
    id: "sunset",
    label: "日落",
    light: "linear-gradient(90deg, #f97316 0%, #ef4444 52%, #ec4899 100%)",
    dark: "linear-gradient(90deg, #fb923c 0%, #f87171 52%, #f472b6 100%)",
    fallbackLight: "#ef4444",
    fallbackDark: "#f87171",
  },
  ocean: {
    id: "ocean",
    label: "海洋",
    light: "linear-gradient(90deg, #0ea5e9 0%, #2563eb 52%, #4f46e5 100%)",
    dark: "linear-gradient(90deg, #38bdf8 0%, #60a5fa 52%, #818cf8 100%)",
    fallbackLight: "#2563eb",
    fallbackDark: "#60a5fa",
  },
  forest: {
    id: "forest",
    label: "森林",
    light: "linear-gradient(90deg, #22c55e 0%, #16a34a 52%, #14b8a6 100%)",
    dark: "linear-gradient(90deg, #4ade80 0%, #34d399 52%, #2dd4bf 100%)",
    fallbackLight: "#16a34a",
    fallbackDark: "#34d399",
  },
  violet: {
    id: "violet",
    label: "紫罗兰",
    light: "linear-gradient(90deg, #8b5cf6 0%, #a855f7 52%, #6366f1 100%)",
    dark: "linear-gradient(90deg, #a78bfa 0%, #c084fc 52%, #818cf8 100%)",
    fallbackLight: "#8b5cf6",
    fallbackDark: "#a78bfa",
  },
  gold: {
    id: "gold",
    label: "金辉",
    light: "linear-gradient(90deg, #f59e0b 0%, #facc15 52%, #fb923c 100%)",
    dark: "linear-gradient(90deg, #fbbf24 0%, #fde047 52%, #fdba74 100%)",
    fallbackLight: "#f59e0b",
    fallbackDark: "#fbbf24",
  },
  rose: {
    id: "rose",
    label: "玫瑰",
    light: "linear-gradient(90deg, #fb7185 0%, #f43f5e 52%, #a855f7 100%)",
    dark: "linear-gradient(90deg, #fda4af 0%, #fb7185 52%, #c084fc 100%)",
    fallbackLight: "#f43f5e",
    fallbackDark: "#fb7185",
  },
};

export const isTextGradientPresetId = (
  value: unknown,
): value is TextGradientPresetId => {
  return typeof value === "string" && value in TEXT_GRADIENT_PRESETS;
};

export const resolveTextGradientStyle = (
  presetId: TextGradientPresetId,
  theme: "light" | "dark",
): ResolvedTextGradientStyle => {
  const preset = TEXT_GRADIENT_PRESETS[presetId];
  if (theme === "dark") {
    return {
      gradient: preset.dark,
      fallbackColor: preset.fallbackDark,
    };
  }
  return {
    gradient: preset.light,
    fallbackColor: preset.fallbackLight,
  };
};
