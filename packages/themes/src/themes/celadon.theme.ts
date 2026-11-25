/**
 * 主题「青瓷」—— 淡青灰纸底 + 黛青墨 + 青瓷色 accent，清冷沉静；色相介于薄荷与海盐之间。
 *
 * 深色（夜瓷）：深青黑底 + 青白墨 + 提亮青瓷色；层级口径同暖纸 · 夜。
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

defineTheme({
  key: "celadon",
  name: "青瓷",
  light: {
    palette: {
      paper: "#ebf3f2",
      surface: "#fbfefe",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#eff3f3",
      sunken: "#d5e4e2", // 凹陷底：page 之下一档
      track: "#d0dedc", // 控件轨道：与 thumb 拉开
      ink1: "#26393a",
      ink2: "#4b6163",
      ink3: "#9fb3b3",
      inkInverse: "#f5fbfb",
      accentHue: 180,
      accentSat: 44, // 百分比，派生用
      accentLight: 28,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(38, 57, 58, 0.05)",
      "bg-press": "rgba(38, 57, 58, 0.09)",
      "bg-selected": "rgba(50, 130, 128, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#dbe8e7",
      "line-2": "rgba(219, 232, 231, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#22605f", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(50, 130, 128, 0.28)",

      ok: "#4a8a62",
      "ok-soft": "#e3efe6",
      warn: "#9c8d54",
      "warn-soft": "#f4efd8",
      danger: "#b0584f",
      "danger-soft": "#f5e3e0",
      info: "#4f7896",
      "info-soft": "#e0e9f0",

      "tag-1": "#4a8a62",
      "tag-1-soft": "#e3efe6",
      "tag-2": "#4f7896",
      "tag-2-soft": "#e0e9f0",
      "tag-3": "#8378a4",
      "tag-3-soft": "#e9e6f2",
      "tag-4": "#9c8d54",
      "tag-4-soft": "#f4efd8",
      "tag-5": "#a86e64",
      "tag-5-soft": "#f4e4e2",

      overlay: "rgba(38, 57, 58, 0.35)",
      "shadow-card": "0 1px 2px rgba(50, 90, 90, 0.06), 0 10px 24px -14px rgba(50, 90, 90, 0.2)",
      "shadow-lift": "0 1px 2px rgba(50, 90, 90, 0.07), 0 6px 16px -10px rgba(50, 90, 90, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(50, 90, 90, 0.4)",
      "shadow-paper":
        "0 0 0 1px rgba(50, 90, 90, 0.07), 0 2px 4px -1px rgba(50, 90, 90, 0.12), 0 22px 44px -18px rgba(50, 90, 90, 0.45)",
      // 壳层极光背景的三团色（模糊后铺在侧栏与大卡留白下，峰值处 ink-2 仍过 AA）
      "glow-1": "#c3e6e4",
      "glow-2": "#cde3ee",
      "glow-3": "#d6ecd8",
    }),
  },
  dark: {
    palette: {
      paper: "#121a1a",
      surface: "#1b2424",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#273030",
      sunken: "#070d0d", // 凹陷底：page 之下一档
      track: "#314040", // 控件轨道：与 thumb 拉开
      ink1: "#dde9e8",
      ink2: "#95a7a6",
      ink3: "#6f817f",
      inkInverse: "#0c1414",
      accentHue: 178,
      accentSat: 36, // 百分比，派生用
      accentLight: 54,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(221, 233, 232, 0.06)",
      "bg-press": "rgba(221, 233, 232, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#263131",
      "line-2": "rgba(38, 49, 49, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#84b294",
      "ok-soft": "#1d2b23",
      warn: "#c8b56e",
      "warn-soft": "#2d2a1a",
      danger: "#df8a80",
      "danger-soft": "#35211e",
      info: "#87b3c9",
      "info-soft": "#1b2a31",

      "tag-1": "#84b294",
      "tag-1-soft": "#1d2b23",
      "tag-2": "#87b3c9",
      "tag-2-soft": "#1b2a31",
      "tag-3": "#a99fd0",
      "tag-3-soft": "#262336",
      "tag-4": "#c8b56e",
      "tag-4-soft": "#2d2a1a",
      "tag-5": "#d49488",
      "tag-5-soft": "#33221f",

      overlay: "rgba(3, 7, 7, 0.55)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
      "shadow-paper":
        "0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.4), 0 24px 48px -16px rgba(0, 0, 0, 0.72)",
      "glow-1": "#0e3534",
      "glow-2": "#102f3a",
      "glow-3": "#15351f",
    }),
  },
});
