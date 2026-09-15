/**
 * 主题「暖纸 · 晨」—— 首个主题，取值来自样板间 direction-a-soft.html 的实测调优结果。
 *
 * 命名与色相：奶油纸底 + 可可墨 + 陶土橙 accent（与移动端「杏子 Bento」同基因）。
 * 融合骨架要求：不提供侧栏专用底色，侧栏透明融于 bg-page（见 03 指南 · 壳层铁律）。
 */

import { defineTheme } from "../defineTheme";

export default defineTheme({
  key: "cream",
  mode: "light",
  name: "暖纸 · 晨",
  palette: {
    paper: "#f3eee2", // 窗口底
    surface: "#fffdf9", // 卡片/面板
    group: "#faf6ec", // 分组容器（比 surface 沉半档，代替横线）
    sunken: "#ece5d4", // 输入底/代码块等凹陷区
    ink1: "#43392c",
    ink2: "#7a6c5a",
    ink3: "#a89a85",
    inkInverse: "#fff8ef",
    accentHue: 22,
    accentSat: 58, // 百分比，派生用
    accentLight: 55,
  },
  tokens: p => ({
    "bg-page": String(p.paper),
    "bg-surface": String(p.surface),
    "bg-group": String(p.group),
    "bg-sunken": String(p.sunken),

    "bg-hover": "rgba(67, 57, 44, 0.05)",
    "bg-press": "rgba(67, 57, 44, 0.09)",
    "bg-selected": "rgba(217, 119, 87, 0.12)",

    "ink-1": String(p.ink1),
    "ink-2": String(p.ink2),
    "ink-3": String(p.ink3),
    "ink-inverse": String(p.inkInverse),

    "line-1": "#e9e1d2",
    "line-2": "rgba(233, 225, 210, 0.55)",

    // accent 派生：基色 hsl(22 58% 55%)，hover 加深、soft 半透明底
    accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
    "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
    "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
    "accent-text": "#b85f42",
    "focus-ring": "0 0 0 3px rgba(217, 119, 87, 0.28)",

    ok: "#61795f",
    "ok-soft": "#e5ede2",
    warn: "#a38c4d",
    "warn-soft": "#f6efd6",
    danger: "#b0564d",
    "danger-soft": "#f6e3e0",
    info: "#5c7d99",
    "info-soft": "#e2ebf3",

    "tag-1": "#61795f",
    "tag-1-soft": "#e5ede2",
    "tag-2": "#5c7d99",
    "tag-2-soft": "#e2ebf3",
    "tag-3": "#8a7aa6",
    "tag-3-soft": "#ebe6f3",
    "tag-4": "#a38c4d",
    "tag-4-soft": "#f6efd6",
    "tag-5": "#b06a5e",
    "tag-5-soft": "#f6e3e0",

    overlay: "rgba(67, 57, 44, 0.35)",
    "shadow-card": "0 1px 2px rgba(120, 100, 70, 0.05), 0 10px 24px -14px rgba(120, 100, 70, 0.18)",
    "shadow-float": "0 16px 40px -12px rgba(120, 100, 70, 0.4)",
  }),
});
