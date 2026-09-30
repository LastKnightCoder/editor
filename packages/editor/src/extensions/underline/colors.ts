import { inlineInk } from "../../constants/inline-palette";

/**
 * 下划线的用户选色：取统一行内色板（与字色、高亮同一套色相），随明暗切换；
 * default 与未知 / 缺省的颜色值跟随文字色。
 */
export const getUnderlineColor = (color: string | undefined) => inlineInk(color) ?? "currentColor";
