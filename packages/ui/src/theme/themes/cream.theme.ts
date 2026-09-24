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
    sunken: "#e7dbc8", // 轨道/凹槽专档：进度轨道、波形未播放段、时间轴（对 page 1.181）；输入框/代码块禁用本档——走 surface 亮底 + line-1 描边（D-007/D-009/D-032）
    track: "#e0d6c3", // 控件轨道（开关/滑杆槽）：米灰，与 thumb(surface) 拉开
    ink1: "#43392c",
    // 原值 #736552 对 page 仅 4.89、对 sunken 3.99——下沉底一深就跌破 AA。
    // 压深留出余量：page 5.60 / surface 6.38 / sunken 4.74。
    ink2: "#6a5c49",
    ink3: "#a89a85",
    inkInverse: "#fff8ef",
    accentHue: 22,
    accentSat: 58, // 百分比，派生用
    accentLight: 42, // AA：实底上 ink-inverse 需 ≥4.5:1，55% 只到 ~3:1
  },
  tokens: p => ({
    "bg-page": String(p.paper),
    "bg-surface": String(p.surface),
    // 实底控件的 hover 档：bg-hover 5% 墨叠 surface 的不透明合成——半透明
    // bg-hover 会整体替换实底（底色消失），浮起按钮必须用不透明 hover
    "bg-surface-hover": "#f6f3ef",
    "bg-sunken": String(p.sunken),
    "bg-track": String(p.track),

    "bg-hover": "rgba(67, 57, 44, 0.05)",
    "bg-press": "rgba(67, 57, 44, 0.09)",
    "bg-selected": "rgba(217, 119, 87, 0.12)",

    "ink-1": String(p.ink1),
    "ink-2": String(p.ink2),
    "ink-3": String(p.ink3),
    "ink-inverse": String(p.inkInverse),

    "line-1": "#e9e1d2",
    "line-2": "rgba(233, 225, 210, 0.55)",

    // accent 派生：基色 hsl(22 58% 42%)，hover 加深、soft 半透明底
    accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
    "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
    "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
    "accent-text": "#a05236", // AA：对 bg-page ≥4.5:1
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
    "shadow-lift": "0 1px 2px rgba(120, 100, 70, 0.06), 0 6px 16px -10px rgba(120, 100, 70, 0.22)",
    "shadow-float": "0 16px 40px -12px rgba(120, 100, 70, 0.4)",
  }),
});
