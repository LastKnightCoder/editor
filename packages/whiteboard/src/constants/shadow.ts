// 阴影大小档位：无 / 小 / 中 / 大
export enum EShadowSize {
  None = "none",
  Small = "small",
  Medium = "medium",
  Large = "large",
}

export interface ShadowSizeOption {
  value: EShadowSize;
  label: string;
}

// 设置面板用到的选项顺序
export const SHADOW_SIZE_OPTIONS: ShadowSizeOption[] = [
  { value: EShadowSize.None, label: "无" },
  { value: EShadowSize.Small, label: "小" },
  { value: EShadowSize.Medium, label: "中" },
  { value: EShadowSize.Large, label: "大" },
];

// 各档位对应的 box-shadow 值，区分亮/暗主题
const SHADOW_MAP: Record<
  Exclude<EShadowSize, EShadowSize.None>,
  { light: string; dark: string }
> = {
  [EShadowSize.Small]: {
    light: "0 1px 3px rgba(15, 23, 42, 0.08)",
    dark: "0 1px 3px rgba(0, 0, 0, 0.3)",
  },
  [EShadowSize.Medium]: {
    light: "0 4px 12px rgba(15, 23, 42, 0.12)",
    dark: "0 4px 12px rgba(0, 0, 0, 0.35)",
  },
  [EShadowSize.Large]: {
    light: "0 12px 32px rgba(15, 23, 42, 0.18)",
    dark: "0 12px 32px rgba(0, 0, 0, 0.5)",
  },
};

// 根据档位与主题返回 box-shadow 字符串；无档位或未设置时返回 "none"
export function getShadowStyle(size: EShadowSize | undefined | null, isDark: boolean): string {
  if (!size || size === EShadowSize.None) return "none";
  const entry = SHADOW_MAP[size];
  if (!entry) return "none";
  return isDark ? entry.dark : entry.light;
}
