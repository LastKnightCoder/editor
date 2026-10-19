/**
 * 视频品牌层：与软件主题解耦，取色自 Tau 图标的藏青 → 金渐变。
 * day = 白昼编辑部（象牙纸 + 藏青墨），night = 夜空星图（深藏青 + 金色星光）。
 */
export const VIDEO = { width: 1920, height: 1080, fps: 60 } as const;

export const palette = {
  day: {
    sky: ["#F7F3EA", "#EFE8DA"],
    ink: "#162231",
    ink2: "#4E5866",
    ink3: "#8E9099",
    accent: "#1F4E79",
    gold: "#A9853F",
    line: "rgba(22, 34, 49, 0.12)",
    paper: "#FFFDF8",
  },
  dusk: {
    sky: ["#2B3460", "#B8826A"],
  },
  night: {
    sky: ["#050918", "#111B3B"],
    ink: "#F1EEE6",
    ink2: "#B4B8CC",
    ink3: "#6E7597",
    accent: "#8FB4E0",
    gold: "#E6C47F",
    star: "#FFF5DE",
    line: "rgba(230, 196, 127, 0.35)",
  },
} as const;

export const fonts = {
  display: '"Noto Serif SC Variable", "Songti SC", serif',
  caption: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
  label: '"JetBrains Mono Variable", ui-monospace, monospace',
  ui: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
} as const;
