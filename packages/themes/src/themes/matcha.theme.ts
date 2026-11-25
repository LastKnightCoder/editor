/**
 * 主题「抹茶」—— 米黄绿纸底 + 橄榄墨 + 抹茶绿 accent，温润偏暖；与薄荷的翠绿拉开色相。
 *
 * 深色（夜茶）：橄榄黑底 + 米白墨 + 提亮抹茶绿；层级口径同暖纸 · 夜。
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

defineTheme({
  key: "matcha",
  name: "抹茶",
  light: {
    palette: {
      paper: "#f1f2e6",
      surface: "#fdfdf7",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f2f2eb",
      sunken: "#dfe2cc", // 凹陷底：page 之下一档
      track: "#d9dcc6", // 控件轨道：与 thumb 拉开
      ink1: "#363a26",
      ink2: "#585d40",
      ink3: "#adb197",
      inkInverse: "#fafbf2",
      accentHue: 76,
      accentSat: 42, // 百分比，派生用
      accentLight: 29,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(54, 58, 38, 0.05)",
      "bg-press": "rgba(54, 58, 38, 0.09)",
      "bg-selected": "rgba(110, 130, 50, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#e3e6d4",
      "line-2": "rgba(227, 230, 212, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#4c5920", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(110, 130, 50, 0.28)",

      ok: "#5b8a4f",
      "ok-soft": "#e5eedf",
      warn: "#9c8d54",
      "warn-soft": "#f4efd8",
      danger: "#b0584f",
      "danger-soft": "#f5e3e0",
      info: "#567f96",
      "info-soft": "#e0ebf0",

      "tag-1": "#5b8a4f",
      "tag-1-soft": "#e5eedf",
      "tag-2": "#567f96",
      "tag-2-soft": "#e0ebf0",
      "tag-3": "#8378a4",
      "tag-3-soft": "#e9e6f2",
      "tag-4": "#9c8d54",
      "tag-4-soft": "#f4efd8",
      "tag-5": "#a86e64",
      "tag-5-soft": "#f4e4e2",

      overlay: "rgba(54, 58, 38, 0.35)",
      "shadow-card": "0 1px 2px rgba(90, 95, 50, 0.06), 0 10px 24px -14px rgba(90, 95, 50, 0.2)",
      "shadow-lift": "0 1px 2px rgba(90, 95, 50, 0.07), 0 6px 16px -10px rgba(90, 95, 50, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(90, 95, 50, 0.4)",
      "shadow-paper":
        "0 0 0 1px rgba(90, 95, 50, 0.07), 0 2px 4px -1px rgba(90, 95, 50, 0.12), 0 22px 44px -18px rgba(90, 95, 50, 0.45)",
      // 壳层极光背景的三团色（模糊后铺在侧栏与大卡留白下，峰值处 ink-2 仍过 AA）
      "glow-1": "#e2ecbd",
      "glow-2": "#eef0c8",
      "glow-3": "#d5e8c6",
    }),
  },
  dark: {
    palette: {
      paper: "#18190f",
      surface: "#222318",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#2d2e23",
      sunken: "#0b0c06", // 凹陷底：page 之下一档
      track: "#3a3c2c", // 控件轨道：与 thumb 拉开
      ink1: "#e8e9da",
      ink2: "#a3a68f",
      ink3: "#7a7d67",
      inkInverse: "#13140c",
      accentHue: 74,
      accentSat: 36, // 百分比，派生用
      accentLight: 56,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(232, 233, 218, 0.06)",
      "bg-press": "rgba(232, 233, 218, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#2e3023",
      "line-2": "rgba(46, 48, 35, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#97b38a",
      "ok-soft": "#212a1c",
      warn: "#c8b56e",
      "warn-soft": "#2d2a1a",
      danger: "#df8a80",
      "danger-soft": "#35211e",
      info: "#87b3c9",
      "info-soft": "#1b2a31",

      "tag-1": "#97b38a",
      "tag-1-soft": "#212a1c",
      "tag-2": "#87b3c9",
      "tag-2-soft": "#1b2a31",
      "tag-3": "#a99fd0",
      "tag-3-soft": "#262336",
      "tag-4": "#c8b56e",
      "tag-4-soft": "#2d2a1a",
      "tag-5": "#d49488",
      "tag-5-soft": "#33221f",

      overlay: "rgba(6, 7, 3, 0.55)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
      "shadow-paper":
        "0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.4), 0 24px 48px -16px rgba(0, 0, 0, 0.72)",
      "glow-1": "#2c3512",
      "glow-2": "#363414",
      "glow-3": "#1e3318",
    }),
  },
});
