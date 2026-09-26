/**
 * 主题「暖纸」—— 首个主题族，一张暖纸的晨与夜。
 *
 * 浅色（晨）：取值来自样板间 direction-a-soft.html 的实测调优结果；奶油纸底 + 可可墨 +
 * 陶土橙 accent（与移动端「杏子 Bento」同基因）。融合骨架要求：不提供侧栏专用底色，
 * 侧栏透明融于 bg-page（见 03 指南 · 壳层铁律）。
 *
 * 深色（夜）：同一张暖纸在烛光下——深可可纸底 + 奶油墨 + 陶土橙提亮。层级与浅色对称翻转：
 * surface 最亮（卡片浮起）、sunken 最暗（凹陷）；交互态改奶油墨低透明叠层（对应浅色的
 * 可可墨叠层）；阴影加深至黑系。
 *
 * 对比度按 02 规范 §2.5：ink-1 对 page/surface ≥ 7:1、ink-2 与 accent 文字 ≥ 4.5:1
 * （由 theme-parity.test.ts 的对比度断言守护，深浅两套都校验）。
 */

import { defineTheme } from "../defineTheme";

export default defineTheme({
  key: "paper",
  name: "暖纸",
  light: {
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
      "shadow-card":
        "0 1px 2px rgba(120, 100, 70, 0.05), 0 10px 24px -14px rgba(120, 100, 70, 0.18)",
      "shadow-lift":
        "0 1px 2px rgba(120, 100, 70, 0.06), 0 6px 16px -10px rgba(120, 100, 70, 0.22)",
      "shadow-float": "0 16px 40px -12px rgba(120, 100, 70, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#221d16", // 窗口底：深可可纸
      surface: "#2e2820", // 卡片/面板：咖啡纸（最亮层）
      // 实底控件 hover 档：bg-hover 6% 奶油墨叠 surface 的不透明合成（同浅色口径）
      surfaceHover: "#39332b",
      sunken: "#100d08", // 凹陷底：page 之下一档（对 page 1.159）
      track: "#463d31", // 控件轨道：中暖棕，亮于 surface——thumb 在其上可辨且不显黑
      ink1: "#ece2d0",
      ink2: "#a89a85",
      ink3: "#857768",
      inkInverse: "#241a10",
      accentHue: 22,
      accentSat: 62, // 百分比，派生用
      accentLight: 65, // 深底提亮一档（浅色是加深），保证 accent 作文字/实底的对比度
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：奶油墨低透明叠层（对应浅色的可可墨叠层）
      "bg-hover": "rgba(236, 226, 208, 0.06)",
      "bg-press": "rgba(236, 226, 208, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#3a3227",
      "line-2": "rgba(58, 50, 39, 0.55)",

      // accent 派生：基色 hsl(22 62% 65%)，深色下 hover 提亮（浅色是加深）、soft 半透明底
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 4}% ${Number(p.accentLight) + 5}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#8cab87",
      "ok-soft": "#243023",
      warn: "#c4a458",
      "warn-soft": "#302917",
      danger: "#d97e66",
      "danger-soft": "#34201a",
      info: "#83aecf",
      "info-soft": "#1e2a35",

      "tag-1": "#8cab87",
      "tag-1-soft": "#243023",
      "tag-2": "#83aecf",
      "tag-2-soft": "#1e2a35",
      "tag-3": "#a596c8",
      "tag-3-soft": "#292335",
      "tag-4": "#c4a458",
      "tag-4-soft": "#302917",
      "tag-5": "#d0806a",
      "tag-5-soft": "#30211b",

      overlay: "rgba(10, 8, 5, 0.55)",
      // 深色下阴影加深至黑系，浮起关系才可感知
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
