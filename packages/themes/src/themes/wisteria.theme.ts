/**
 * 主题「紫藤」—— 淡紫灰纸底 + 暮紫墨 + 紫藤色 accent，柔和文艺。
 *
 * 浅色（晴）：纸底带一丝紫调，墨色取暮紫而非纯黑，accent 为中明度紫藤色。
 * 深色（夜紫）：深紫夜底 + 藤白墨 + 紫藤提亮；层级口径同暖纸 · 夜。
 *
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

export default defineTheme({
  key: "wisteria",
  name: "紫藤",
  light: {
    palette: {
      paper: "#f1eff6",
      surface: "#fdfcff",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f3f2f6",
      sunken: "#dfdbea", // 凹陷底：page 之下一档
      track: "#dad5e6", // 控件轨道：与 thumb 拉开
      ink1: "#342d46",
      ink2: "#5f5775",
      ink3: "#aba4bd",
      inkInverse: "#fbf9ff",
      accentHue: 262,
      accentSat: 42, // 百分比，派生用
      accentLight: 50,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(52, 45, 70, 0.05)",
      "bg-press": "rgba(52, 45, 70, 0.09)",
      "bg-selected": "rgba(114, 82, 181, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#e5e1ee",
      "line-2": "rgba(229, 225, 238, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#62449f", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(114, 82, 181, 0.28)",

      ok: "#5a7f66",
      "ok-soft": "#e3eee6",
      warn: "#9a8651",
      "warn-soft": "#f4eed8",
      danger: "#b0566a",
      "danger-soft": "#f6e2e7",
      info: "#5a74a0",
      "info-soft": "#e1e8f4",

      "tag-1": "#5a7f66",
      "tag-1-soft": "#e3eee6",
      "tag-2": "#5a74a0",
      "tag-2-soft": "#e1e8f4",
      "tag-3": "#8a6fb0",
      "tag-3-soft": "#ece5f5",
      "tag-4": "#9a8651",
      "tag-4-soft": "#f4eed8",
      "tag-5": "#b0667c",
      "tag-5-soft": "#f5e3e9",

      overlay: "rgba(52, 45, 70, 0.35)",
      "shadow-card": "0 1px 2px rgba(80, 64, 120, 0.06), 0 10px 24px -14px rgba(80, 64, 120, 0.2)",
      "shadow-lift": "0 1px 2px rgba(80, 64, 120, 0.07), 0 6px 16px -10px rgba(80, 64, 120, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(80, 64, 120, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#1a1724",
      surface: "#242031",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#302c3d",
      sunken: "#0e0c15", // 凹陷底：page 之下一档
      track: "#3d374d", // 控件轨道：与 thumb 拉开
      ink1: "#e8e3f2",
      ink2: "#a59fb8",
      ink3: "#7f7893",
      inkInverse: "#16121f",
      accentHue: 262,
      accentSat: 60, // 百分比，派生用
      accentLight: 72,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(232, 227, 242, 0.06)",
      "bg-press": "rgba(232, 227, 242, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#302b3d",
      "line-2": "rgba(48, 43, 61, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#86b596",
      "ok-soft": "#1f2d25",
      warn: "#cbb46f",
      "warn-soft": "#2e2a1b",
      danger: "#e48ca0",
      "danger-soft": "#37202a",
      info: "#8fa9dc",
      "info-soft": "#1e2638",

      "tag-1": "#86b596",
      "tag-1-soft": "#1f2d25",
      "tag-2": "#8fa9dc",
      "tag-2-soft": "#1e2638",
      "tag-3": "#b39be0",
      "tag-3-soft": "#2a2340",
      "tag-4": "#cbb46f",
      "tag-4-soft": "#2e2a1b",
      "tag-5": "#d98fa6",
      "tag-5-soft": "#35212b",

      overlay: "rgba(6, 5, 10, 0.55)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
