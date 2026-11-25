/**
 * 主题「黑白」—— 给不想要颜色的人：表面与墨色全部无彩，卡片取纯白 / 近黑保证识别度。
 *
 * 浅色：浅灰窗口底 + 纯白卡片 + 近黑墨；accent 就是墨色本身（主按钮黑底白字），
 * 选中靠墨色低透明叠层。
 * 深色：纯黑窗口底（OLED）+ 近黑卡片浮起；卡片阴影带一圈极淡白描边，黑底上也认得出轮廓。
 * 纯黑底之下没有更深的一档，sunken 与 page 同为纯黑，凹槽类部件靠所在卡片的亮度托出。
 *
 * 状态色与标签色是表意信息，保留但压到很低的彩度（同水墨口径）。
 * 对比度按 02 规范 §2.5，深浅两套均由 theme-parity.test.ts 校验。
 */

import { defineTheme } from "../defineTheme.ts";

defineTheme({
  key: "mono",
  name: "黑白",
  // 最素的一套：始终排在所有主题最后（新增主题无需关心顺序）
  order: Infinity,
  light: {
    palette: {
      paper: "#f2f2f2",
      surface: "#ffffff",
      // 实底控件 hover 档：bg-hover 5% 墨叠 surface 的不透明合成
      surfaceHover: "#f3f3f3",
      sunken: "#e0e0e0",
      track: "#d9d9d9",
      ink1: "#111111",
      ink2: "#555555",
      ink3: "#a3a3a3",
      inkInverse: "#ffffff",
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(17, 17, 17, 0.05)",
      "bg-press": "rgba(17, 17, 17, 0.09)",
      "bg-selected": "rgba(17, 17, 17, 0.08)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#e3e3e3",
      "line-2": "rgba(227, 227, 227, 0.6)",

      accent: String(p.ink1),
      "accent-hover": "#333333",
      "accent-soft": "rgba(17, 17, 17, 0.07)",
      "accent-text": "#000000",
      "focus-ring": "0 0 0 3px rgba(17, 17, 17, 0.22)",

      ok: "#5d7a68",
      "ok-soft": "#e6ebe7",
      warn: "#8f7a4c",
      "warn-soft": "#efebe1",
      danger: "#a8554a",
      "danger-soft": "#f3e4e1",
      info: "#55697a",
      "info-soft": "#e3e8ec",

      "tag-1": "#5d7a68",
      "tag-1-soft": "#e6ebe7",
      "tag-2": "#55697a",
      "tag-2-soft": "#e3e8ec",
      "tag-3": "#73707f",
      "tag-3-soft": "#e9e8ec",
      "tag-4": "#8f7a4c",
      "tag-4-soft": "#efebe1",
      "tag-5": "#8e6b5c",
      "tag-5-soft": "#f0e7e3",

      overlay: "rgba(0, 0, 0, 0.35)",
      "shadow-card": "0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 24px -14px rgba(0, 0, 0, 0.14)",
      "shadow-lift": "0 1px 2px rgba(0, 0, 0, 0.05), 0 6px 16px -10px rgba(0, 0, 0, 0.18)",
      "shadow-float": "0 16px 40px -12px rgba(0, 0, 0, 0.28)",
      "shadow-paper":
        "0 0 0 1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.1), 0 22px 44px -18px rgba(0, 0, 0, 0.4)",
      // 极光背景退化为无彩灰阶，只留明暗起伏
      "glow-1": "#e6e6e6",
      "glow-2": "#ebebeb",
      "glow-3": "#e0e0e0",
    }),
  },
  dark: {
    palette: {
      paper: "#000000",
      surface: "#161616",
      // 实底控件 hover 档：bg-hover 6% 浅墨叠 surface 的不透明合成
      surfaceHover: "#232323",
      sunken: "#000000",
      track: "#333333",
      ink1: "#ededed",
      ink2: "#a0a0a0",
      ink3: "#6b6b6b",
      inkInverse: "#000000",
    },
    tokens: p => ({
      "bg-page": String(p.paper),
      "bg-surface": String(p.surface),
      "bg-surface-hover": String(p.surfaceHover),
      "bg-sunken": String(p.sunken),
      "bg-track": String(p.track),

      "bg-hover": "rgba(237, 237, 237, 0.06)",
      "bg-press": "rgba(237, 237, 237, 0.11)",
      "bg-selected": "rgba(237, 237, 237, 0.1)",

      "ink-1": String(p.ink1),
      "ink-2": String(p.ink2),
      "ink-3": String(p.ink3),
      "ink-inverse": String(p.inkInverse),

      "line-1": "#262626",
      "line-2": "rgba(38, 38, 38, 0.6)",

      accent: String(p.ink1),
      "accent-hover": "#ffffff",
      "accent-soft": "rgba(237, 237, 237, 0.1)",
      "accent-text": "#ffffff",
      "focus-ring": "0 0 0 3px rgba(237, 237, 237, 0.3)",

      ok: "#8fae99",
      "ok-soft": "#18201b",
      warn: "#c2ad7c",
      "warn-soft": "#221f16",
      danger: "#d68c80",
      "danger-soft": "#2a1a18",
      info: "#94a9ba",
      "info-soft": "#171c21",

      "tag-1": "#8fae99",
      "tag-1-soft": "#18201b",
      "tag-2": "#94a9ba",
      "tag-2-soft": "#171c21",
      "tag-3": "#a6a2b6",
      "tag-3-soft": "#1d1c22",
      "tag-4": "#c2ad7c",
      "tag-4-soft": "#221f16",
      "tag-5": "#c49d8c",
      "tag-5-soft": "#251d19",

      overlay: "rgba(0, 0, 0, 0.7)",
      // 黑底上投影不可见：卡片类阴影带一圈极淡白描边勾出轮廓
      "shadow-card": "0 0 0 1px rgba(255, 255, 255, 0.06), 0 10px 24px -14px rgba(0, 0, 0, 0.8)",
      "shadow-lift": "0 0 0 1px rgba(255, 255, 255, 0.08), 0 6px 16px -10px rgba(0, 0, 0, 0.8)",
      "shadow-float": "0 0 0 1px rgba(255, 255, 255, 0.08), 0 16px 40px -12px rgba(0, 0, 0, 0.9)",
      "shadow-paper":
        "0 0 0 1px rgba(255, 255, 255, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.5), 0 24px 48px -16px rgba(0, 0, 0, 0.9)",
      "glow-1": "#141414",
      "glow-2": "#101010",
      "glow-3": "#181818",
    }),
  },
});
