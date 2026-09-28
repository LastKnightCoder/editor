/**
 * 主题「樱花」—— 樱粉纸底 + 梅褐墨 + 莓粉 accent，温柔明亮。
 *
 * 浅色（晴）：纸底粉调强度对齐暖纸的暖调；accent 受 AA 所限明度不能高，粉感靠高饱和
 * （62%）撑起，选中 / soft 底透明度也提一档让粉色在界面里可见；danger 偏橙红，与莓粉拉开。
 * 深色（夜樱）：夜底带一层梅粉调（可辨但不整页泛粉）+ 樱白墨 + 高饱和莓粉 accent。
 *
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

export default defineTheme({
  key: "sakura",
  name: "樱花",
  light: {
    palette: {
      paper: "#f9eef1", // 樱粉纸底：粉调强度对齐暖纸的暖调（一眼可辨，仍是柔和纸色）
      surface: "#fffafb",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f6f0f1",
      sunken: "#eddde2", // 凹陷底：page 之下一档
      track: "#e8d6dc", // 控件轨道：与 thumb 拉开
      ink1: "#422d35",
      ink2: "#6d5560",
      ink3: "#b3a2a8",
      inkInverse: "#fffafb",
      accentHue: 340,
      accentSat: 62, // 百分比，派生用；AA 限制明度不能高，粉感靠饱和度撑
      accentLight: 47,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(66, 45, 53, 0.05)",
      "bg-press": "rgba(66, 45, 53, 0.09)",
      "bg-selected": "rgba(194, 46, 95, 0.14)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#f0e2e6",
      "line-2": "rgba(240, 226, 230, 0.55)",

      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.14)`,
      "accent-text": "#a8295a", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(194, 46, 95, 0.28)",

      ok: "#5f7d67",
      "ok-soft": "#e3ede5",
      warn: "#9f8850",
      "warn-soft": "#f5eed9",
      danger: "#b3483f",
      "danger-soft": "#f7e2de",
      info: "#58739a",
      "info-soft": "#e2e8f2",

      "tag-1": "#5f7d67",
      "tag-1-soft": "#e3ede5",
      "tag-2": "#58739a",
      "tag-2-soft": "#e2e8f2",
      "tag-3": "#8873a6",
      "tag-3-soft": "#ebe5f3",
      "tag-4": "#9f8850",
      "tag-4-soft": "#f5eed9",
      "tag-5": "#b0606e",
      "tag-5-soft": "#f6e3e7",

      overlay: "rgba(66, 45, 53, 0.35)",
      "shadow-card": "0 1px 2px rgba(110, 70, 85, 0.06), 0 10px 24px -14px rgba(110, 70, 85, 0.2)",
      "shadow-lift": "0 1px 2px rgba(110, 70, 85, 0.07), 0 6px 16px -10px rgba(110, 70, 85, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(110, 70, 85, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#1c1719", // 夜樱底：带一层梅粉调，但不整页泛粉
      surface: "#271f23",
      // 实底控件 hover 档：bg-hover 6% 墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#332b2f",
      sunken: "#100b0d", // 凹陷底：page 之下一档
      track: "#42363b", // 控件轨道：与 thumb 拉开
      ink1: "#f0e2e8",
      ink2: "#ae9ea6",
      ink3: "#85767d",
      inkInverse: "#1a1216",
      accentHue: 340,
      accentSat: 62, // 百分比，派生用
      accentLight: 72,
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：浅墨低透明叠层
      "bg-hover": "rgba(240, 226, 232, 0.06)",
      "bg-press": "rgba(240, 226, 232, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.22)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#34292e",
      "line-2": "rgba(52, 41, 46, 0.55)",

      // 深色下 accent hover 提亮（浅色是加深）
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.18)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 6}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#8cb094",
      "ok-soft": "#1f2a22",
      warn: "#cbb26f",
      "warn-soft": "#2e2a1b",
      danger: "#e3897c",
      "danger-soft": "#36211d",
      info: "#8fa9d4",
      "info-soft": "#1e2533",

      "tag-1": "#8cb094",
      "tag-1-soft": "#1f2a22",
      "tag-2": "#8fa9d4",
      "tag-2-soft": "#1e2533",
      "tag-3": "#b39fd6",
      "tag-3-soft": "#29233a",
      "tag-4": "#cbb26f",
      "tag-4-soft": "#2e2a1b",
      "tag-5": "#d992a0",
      "tag-5-soft": "#352127",

      overlay: "rgba(6, 4, 5, 0.55)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
