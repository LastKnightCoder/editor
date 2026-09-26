/**
 * 主题「薄荷」—— 取自移动端薄荷 Mint（浅色·清新）：灰绿纸底 + 松墨 + 翠绿 accent。
 *
 * 浅色（晴）：底色 / 墨色 / 状态色沿用移动端；ink-2 与 accent 按桌面 AA 门禁压深。
 * 深色（夜林）：移动端无深色版，按同色相推演——近中性夜底（只留一丝绿意）+ 灰白墨 +
 * 低饱和灰绿 accent；绿色只交给 accent，背景与墨色不再整体泛绿。
 *
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme";

export default defineTheme({
  key: "mint",
  name: "薄荷",
  light: {
    palette: {
      paper: "#eef4ee",
      surface: "#fbfefb",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f1f4f1",
      sunken: "#d9e6da", // 凹陷底：page 之下一档
      track: "#d4dfd5", // 控件轨道：与 thumb 拉开
      ink1: "#2e3d31",
      ink2: "#526350",
      ink3: "#a5b3a3",
      inkInverse: "#f6fbf7",
      accentHue: 153,
      accentSat: 40, // 百分比，派生用
      accentLight: 33,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(46, 61, 49, 0.05)",
      "bg-press": "rgba(46, 61, 49, 0.09)",
      "bg-selected": "rgba(74, 157, 120, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#dfe9df",
      "line-2": "rgba(223, 233, 223, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#2f6b50", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(74, 157, 120, 0.28)",

      ok: "#4a8a62",
      "ok-soft": "#e3efe6",
      warn: "#9c8d54",
      "warn-soft": "#f4efd8",
      danger: "#b0584f",
      "danger-soft": "#f5e3e0",
      info: "#567f96",
      "info-soft": "#e0ebf0",

      "tag-1": "#4a8a62",
      "tag-1-soft": "#e3efe6",
      "tag-2": "#567f96",
      "tag-2-soft": "#e0ebf0",
      "tag-3": "#8378a4",
      "tag-3-soft": "#e9e6f2",
      "tag-4": "#9c8d54",
      "tag-4-soft": "#f4efd8",
      "tag-5": "#a86e64",
      "tag-5-soft": "#f4e4e2",

      overlay: "rgba(46, 61, 49, 0.35)",
      "shadow-card": "0 1px 2px rgba(60, 90, 70, 0.06), 0 10px 24px -14px rgba(60, 90, 70, 0.2)",
      "shadow-lift": "0 1px 2px rgba(60, 90, 70, 0.07), 0 6px 16px -10px rgba(60, 90, 70, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(60, 90, 70, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#171a19", // 近中性夜底，只留一丝绿意（绿色交给 accent）
      surface: "#202423",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#2c302f",
      sunken: "#0c0e0d", // 凹陷底：page 之下一档
      track: "#363c3a", // 控件轨道：与 thumb 拉开
      ink1: "#e2e8e4",
      ink2: "#9ba49e",
      ink3: "#747d77",
      inkInverse: "#111513",
      accentHue: 158,
      accentSat: 28, // 百分比，派生用；深底上压低饱和，避免整页泛绿
      accentLight: 60,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(226, 232, 228, 0.06)",
      "bg-press": "rgba(226, 232, 228, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#2a2f2d",
      "line-2": "rgba(42, 47, 45, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#8aab95",
      "ok-soft": "#1e2923",
      warn: "#c8b56e",
      "warn-soft": "#2d2a1a",
      danger: "#df8a80",
      "danger-soft": "#35211e",
      info: "#87b3c9",
      "info-soft": "#1b2a31",

      "tag-1": "#8aab95",
      "tag-1-soft": "#1e2923",
      "tag-2": "#87b3c9",
      "tag-2-soft": "#1b2a31",
      "tag-3": "#a99fd0",
      "tag-3-soft": "#262336",
      "tag-4": "#c8b56e",
      "tag-4-soft": "#2d2a1a",
      "tag-5": "#d49488",
      "tag-5-soft": "#33221f",

      overlay: "rgba(4, 6, 5, 0.55)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
