/**
 * 主题「石墨」—— 纯中性灰纸底 + 石墨墨 + 朱砂 accent：黑白水墨上的一枚印章，克制专业。
 *
 * 浅色（晴）：去掉一切色偏的中性灰阶，色彩只留给 accent 与语义状态色。
 * 深色（夜）：近纯黑炭灰 + 灰白墨 + 朱砂提亮；层级口径同暖纸 · 夜。
 *
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme";

export default defineTheme({
  key: "graphite",
  name: "石墨",
  light: {
    palette: {
      paper: "#eeeeec",
      surface: "#fdfdfc",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f2f2f1",
      sunken: "#dadad7", // 凹陷底：page 之下一档
      track: "#d6d6d3", // 控件轨道：与 thumb 拉开
      ink1: "#262626",
      ink2: "#595957",
      ink3: "#a3a3a0",
      inkInverse: "#fcfcfb",
      accentHue: 6,
      accentSat: 62, // 百分比，派生用
      accentLight: 45,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(38, 38, 38, 0.05)",
      "bg-press": "rgba(38, 38, 38, 0.09)",
      "bg-selected": "rgba(187, 63, 44, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#e3e3e0",
      "line-2": "rgba(227, 227, 224, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#a93a29", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(187, 63, 44, 0.28)",

      ok: "#5b7a5f",
      "ok-soft": "#e4ece4",
      warn: "#98844a",
      "warn-soft": "#f3eed9",
      danger: "#b5344b",
      "danger-soft": "#f6e1e4",
      info: "#52739a",
      "info-soft": "#e1e8f1",

      "tag-1": "#5b7a5f",
      "tag-1-soft": "#e4ece4",
      "tag-2": "#52739a",
      "tag-2-soft": "#e1e8f1",
      "tag-3": "#7d71a1",
      "tag-3-soft": "#e8e5f1",
      "tag-4": "#98844a",
      "tag-4-soft": "#f3eed9",
      "tag-5": "#a8615a",
      "tag-5-soft": "#f4e3e1",

      overlay: "rgba(38, 38, 38, 0.35)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.06), 0 10px 24px -14px rgba(0, 0, 0, 0.2)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.07), 0 6px 16px -10px rgba(0, 0, 0, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#171717",
      surface: "#212121",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#2d2d2d",
      sunken: "#0a0a0a", // 凹陷底：page 之下一档
      track: "#383838", // 控件轨道：与 thumb 拉开
      ink1: "#ebebe9",
      ink2: "#a3a3a0",
      ink3: "#7a7a77",
      inkInverse: "#1a1a1a",
      accentHue: 8,
      accentSat: 70, // 百分比，派生用
      accentLight: 64,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(234, 234, 232, 0.06)",
      "bg-press": "rgba(234, 234, 232, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#2c2c2c",
      "line-2": "rgba(44, 44, 44, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#8bb08f",
      "ok-soft": "#1f2b21",
      warn: "#c9b26c",
      "warn-soft": "#2d2a1b",
      danger: "#e6828f",
      "danger-soft": "#361f24",
      info: "#8eaad0",
      "info-soft": "#1e2633",

      "tag-1": "#8bb08f",
      "tag-1-soft": "#1f2b21",
      "tag-2": "#8eaad0",
      "tag-2-soft": "#1e2633",
      "tag-3": "#a99dd0",
      "tag-3-soft": "#262335",
      "tag-4": "#c9b26c",
      "tag-4-soft": "#2d2a1b",
      "tag-5": "#d69188",
      "tag-5-soft": "#33221f",

      overlay: "rgba(0, 0, 0, 0.6)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
