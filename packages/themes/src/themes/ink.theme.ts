/**
 * 主题「水墨」—— 宣纸落墨：近白而非纯白、近黑而非纯黑，彩度压到最低，素净留白。
 *
 * 浅色（宣纸）：微暖米白纸底 + 浓墨；accent 取低饱和「青黛」（墨中带一丝蓝灰），仍是墨色却可辨识；
 * 状态色取国画颜料（石绿 / 藤黄 / 朱砂 / 花青 / 赭石）并全部降饱和；阴影比其它主题更淡，画面更平静。
 * 深色（松烟）：暖黑墨底 + 宣纸色墨字 + 提亮青黛；层级口径同暖纸 · 夜。
 *
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

export default defineTheme({
  key: "ink",
  name: "水墨",
  // 素色主题收尾：设置页始终排在所有彩色主题之后（新增主题无需关心顺序）
  order: Infinity,
  light: {
    palette: {
      paper: "#f5f4f0",
      surface: "#fcfbf8",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f1f0ed",
      sunken: "#e2e0da", // 凹陷底：page 之下一档
      track: "#dcdad3", // 控件轨道：与 thumb 拉开
      ink1: "#1f1f1d",
      ink2: "#55544f",
      ink3: "#a3a19a",
      inkInverse: "#fbfaf7",
      accentHue: 205,
      accentSat: 18, // 百分比，派生用
      accentLight: 32,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(31, 31, 29, 0.05)",
      "bg-press": "rgba(31, 31, 29, 0.09)",
      "bg-selected": "rgba(67, 84, 96, 0.1)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#e6e4de",
      "line-2": "rgba(230, 228, 222, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#3f4f5c", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(67, 84, 96, 0.25)",

      ok: "#5d7a68",
      "ok-soft": "#e4ebe6",
      warn: "#98814f",
      "warn-soft": "#f1ecdd",
      danger: "#a8554a",
      "danger-soft": "#f4e3df",
      info: "#4f6a80",
      "info-soft": "#e1e8ee",

      "tag-1": "#5d7a68",
      "tag-1-soft": "#e4ebe6",
      "tag-2": "#4f6a80",
      "tag-2-soft": "#e1e8ee",
      "tag-3": "#7a7090",
      "tag-3-soft": "#e9e6ee",
      "tag-4": "#98814f",
      "tag-4-soft": "#f1ecdd",
      "tag-5": "#9c6b55",
      "tag-5-soft": "#f2e6df",

      overlay: "rgba(31, 31, 29, 0.35)",
      "shadow-card": "0 1px 2px rgba(40, 38, 30, 0.04), 0 10px 24px -14px rgba(40, 38, 30, 0.14)",
      "shadow-lift": "0 1px 2px rgba(40, 38, 30, 0.05), 0 6px 16px -10px rgba(40, 38, 30, 0.18)",
      "shadow-float": "0 16px 40px -12px rgba(40, 38, 30, 0.3)",
      "shadow-paper":
        "0 0 0 1px rgba(40, 38, 30, 0.07), 0 2px 4px -1px rgba(40, 38, 30, 0.12), 0 22px 44px -18px rgba(40, 38, 30, 0.45)",
    }),
  },
  dark: {
    palette: {
      paper: "#1a1a19",
      surface: "#232321",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#2f2f2c",
      sunken: "#0d0d0c", // 凹陷底：page 之下一档
      track: "#393936", // 控件轨道：与 thumb 拉开
      ink1: "#e6e4df",
      ink2: "#a09e97",
      ink3: "#78766f",
      inkInverse: "#161615",
      accentHue: 205,
      accentSat: 22, // 百分比，派生用
      accentLight: 68,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(230, 228, 223, 0.06)",
      "bg-press": "rgba(230, 228, 223, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#2e2e2b",
      "line-2": "rgba(46, 46, 43, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#8fae99",
      "ok-soft": "#1f2a23",
      warn: "#c4ad78",
      "warn-soft": "#2c281c",
      danger: "#d68c80",
      "danger-soft": "#33221f",
      info: "#8faac0",
      "info-soft": "#1d252c",

      "tag-1": "#8fae99",
      "tag-1-soft": "#1f2a23",
      "tag-2": "#8faac0",
      "tag-2-soft": "#1d252c",
      "tag-3": "#a79fbd",
      "tag-3-soft": "#26232f",
      "tag-4": "#c4ad78",
      "tag-4-soft": "#2c281c",
      "tag-5": "#c99a84",
      "tag-5-soft": "#30251f",

      overlay: "rgba(0, 0, 0, 0.6)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
      "shadow-paper":
        "0 0 0 1px rgba(255, 255, 255, 0.06), 0 2px 4px -1px rgba(0, 0, 0, 0.4), 0 24px 48px -16px rgba(0, 0, 0, 0.72)",
    }),
  },
});
