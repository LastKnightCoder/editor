/**
 * 主题「暖纸 · 夜」—— 首个深色主题，与 cream（暖纸 · 晨）同基因：同一张暖纸
 * 在烛光下——深可可纸底 + 奶油墨 + 陶土橙提亮。
 *
 * 层级与浅色对称翻转：surface 最亮（卡片浮起）、sunken 最暗（凹陷）；
 * 交互态改奶油墨低透明叠层（对应浅色的可可墨叠层）；阴影加深至黑系。
 * 对比度按 02 规范 §2.5：ink-1 对 page/surface ≥ 7:1、ink-2 与 accent 文字 ≥ 4.5:1
 * （由 theme-parity.test.ts 的对比度断言守护）。
 */

import { defineTheme } from "../defineTheme";

export default defineTheme({
  key: "cocoa",
  mode: "dark",
  name: "暖纸 · 夜",
  palette: {
    paper: "#221d16", // 窗口底：深可可纸
    surface: "#2e2820", // 卡片/面板：咖啡纸（最亮层）
    // 与 cream 对称：凹陷填充落在 page 之下（原 #2a241b 对 surface 仅 1.054，
    // 等于没有）。深色下 surface 最亮、sunken 最暗，故"沉"= 更暗。
    group: "#19150e", // 对 page 1.087、对 surface 1.247
    sunken: "#100d08", // 比 group 再深一档（对 page 1.159）
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
    "bg-group": String(p.group),
    "bg-sunken": String(p.sunken),
    "bg-track": String(p.track),

    // 深色交互态：奶油墨低透明叠层（对应 cream 的可可墨叠层）
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

    // 语义状态色沿用 cream 色相，提亮适配深底；soft 为带色相的深底
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
    "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
  }),
});
