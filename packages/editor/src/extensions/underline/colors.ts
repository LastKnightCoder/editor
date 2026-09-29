/**
 * 下划线的用户选色（选色器预览与正文渲染共用）。
 * 是用户挑的具体颜色，不随主题变化；default 跟随文字色。
 */
export const UNDERLINE_COLORS: Record<string, string> = {
  default: "currentColor",
  yellow: "rgb(255, 212, 0)",
  green: "rgb(42, 157, 143)",
  blue: "rgb(162, 210, 255)",
  purple: "rgb(94, 84, 142)",
  red: "rgb(239, 35, 60)",
};

/** 未知 / 缺省的颜色值回退为跟随文字色 */
export const getUnderlineColor = (color: string | undefined) =>
  (color && UNDERLINE_COLORS[color]) || UNDERLINE_COLORS.default;
