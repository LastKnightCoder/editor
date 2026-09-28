/**
 * 主题「海盐」—— 取自移动端海盐 Ocean（浅色·沉静）：盐雾蓝灰纸底 + 石板墨 + 海盐蓝 accent。
 *
 * 浅色（晴）：底色 / 墨色 / 品牌蓝沿用移动端取值；桌面对比度门禁更严（02 规范 §2.5），
 * ink-2 与 accent 按 AA 压深，并补齐移动端没有的 sunken / track 档。
 *
 * 深色（夜）：移动端无深色版，按同色相推演为「夜海」——深海军蓝底 + 盐白墨 + 海盐蓝提亮。
 * 层级与浅色对称翻转（同暖纸 · 夜的口径）：surface 最亮、sunken 最暗；交互态改盐白墨低透明
 * 叠层；阴影加深至黑系。
 */

import { defineTheme } from "../defineTheme.ts";

export default defineTheme({
  key: "ocean",
  name: "海盐",
  light: {
    palette: {
      paper: "#edf2f8", // 窗口底：盐雾（移动端 --bg-page）
      surface: "#fcfdff", // 卡片/面板（移动端 --bg-surface）
      // 实底控件 hover 档：bg-hover 5% 石板墨叠 surface 的不透明合成（同暖纸口径）
      surfaceHover: "#f2f3f6",
      sunken: "#d6e0ec", // 轨道/凹槽专档：page 之下一档；输入框/代码块禁用本档（D-007/D-009/D-032）
      track: "#d3dce8", // 控件轨道：灰蓝，与 thumb(surface) 拉开
      ink1: "#2d3644", // 石板墨（移动端 --ink-1）
      // 移动端 #728096 对 page 仅 ~3.7，压深到 sunken 上仍过 AA
      ink2: "#56637a",
      ink3: "#a6b1c2",
      inkInverse: "#f7faff",
      accentHue: 214,
      accentSat: 50, // 百分比，派生用
      accentLight: 44, // 移动端 #4d7fc4（~53%）上白字只到 ~4.3:1，压深过 AA
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(45, 54, 68, 0.05)",
      "bg-press": "rgba(45, 54, 68, 0.09)",
      "bg-selected": "rgba(77, 127, 196, 0.12)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#dde5ef",
      "line-2": "rgba(221, 229, 239, 0.55)",

      // accent 派生：基色 hsl(214 50% 44%)，hover 加深、soft 半透明底
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) - 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.12)`,
      "accent-text": "#35659f", // AA：对 bg-page ≥4.5:1
      "focus-ring": "0 0 0 3px rgba(77, 127, 196, 0.28)",

      // 语义状态色沿用移动端（sage / butter / sky），danger 取偏冷的砖红与蓝底协调
      ok: "#527f63",
      "ok-soft": "#e2eee6",
      warn: "#97894e",
      "warn-soft": "#f3eed6",
      danger: "#b4555b",
      "danger-soft": "#f5e3e4",
      info: "#4d6f9e",
      "info-soft": "#dfe9f5",

      "tag-1": "#527f63",
      "tag-1-soft": "#e2eee6",
      "tag-2": "#4d6f9e",
      "tag-2-soft": "#dfe9f5",
      "tag-3": "#7f74a8",
      "tag-3-soft": "#e8e5f3",
      "tag-4": "#97894e",
      "tag-4-soft": "#f3eed6",
      "tag-5": "#a56677",
      "tag-5-soft": "#f5e3e6",

      overlay: "rgba(45, 54, 68, 0.35)",
      "shadow-card": "0 1px 2px rgba(60, 80, 120, 0.06), 0 10px 24px -14px rgba(60, 80, 120, 0.2)",
      "shadow-lift": "0 1px 2px rgba(60, 80, 120, 0.07), 0 6px 16px -10px rgba(60, 80, 120, 0.24)",
      "shadow-float": "0 16px 40px -12px rgba(60, 80, 120, 0.4)",
    }),
  },
  dark: {
    palette: {
      paper: "#161c25", // 窗口底：夜海
      surface: "#1f2733", // 卡片/面板：最亮层
      // 实底控件 hover 档：bg-hover 6% 盐白墨叠 surface 的不透明合成
      surfaceHover: "#2b333f",
      sunken: "#0b1017", // 凹陷底：page 之下一档
      track: "#37424f", // 控件轨道：亮于 surface，thumb 在其上可辨
      ink1: "#e3eaf4",
      ink2: "#9aa7b9",
      ink3: "#748196",
      inkInverse: "#0f1722",
      accentHue: 214,
      accentSat: 62,
      accentLight: 66, // 深底提亮一档（浅色是加深）
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      // 深色交互态：盐白墨低透明叠层（对应浅色的石板墨叠层）
      "bg-hover": "rgba(227, 234, 244, 0.06)",
      "bg-press": "rgba(227, 234, 244, 0.11)",
      "bg-selected": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.2)`,

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#2c3542",
      "line-2": "rgba(44, 53, 66, 0.55)",

      // accent 派生：基色 hsl(214 62% 66%)，深色下 hover 提亮、soft 半透明底
      accent: `hsl(${p.accentHue} ${p.accentSat}% ${p.accentLight}%)`,
      "accent-hover": `hsl(${p.accentHue} ${p.accentSat}% ${Number(p.accentLight) + 7}%)`,
      "accent-soft": `hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.16)`,
      "accent-text": `hsl(${p.accentHue} ${Number(p.accentSat) + 8}% ${Number(p.accentLight) + 6}%)`,
      "focus-ring": `0 0 0 3px hsla(${p.accentHue}, ${p.accentSat}%, ${p.accentLight}%, 0.4)`,

      // 语义状态色沿用浅色色相，提亮适配深底；soft 为带色相的深底
      ok: "#82b394",
      "ok-soft": "#1f2e26",
      warn: "#c9b36a",
      "warn-soft": "#2e2a1a",
      danger: "#e0848a",
      "danger-soft": "#36202a",
      info: "#86abd9",
      "info-soft": "#1c2838",

      "tag-1": "#82b394",
      "tag-1-soft": "#1f2e26",
      "tag-2": "#86abd9",
      "tag-2-soft": "#1c2838",
      "tag-3": "#a79ad6",
      "tag-3-soft": "#272338",
      "tag-4": "#c9b36a",
      "tag-4-soft": "#2e2a1a",
      "tag-5": "#d48a9b",
      "tag-5-soft": "#33212a",

      overlay: "rgba(5, 8, 12, 0.55)",
      // 深色下阴影加深至黑系，浮起关系才可感知
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.24), 0 10px 24px -14px rgba(0, 0, 0, 0.5)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.26), 0 6px 16px -10px rgba(0, 0, 0, 0.52)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.65)",
    }),
  },
});
