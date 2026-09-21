/**
 * 四分类展示色（text / soft 背景对，双主题共用）。
 * 域内数据色，性质同文章页封面派生色板，不进主题词表（02 规范 §3）；
 * 跨域复用时再议收口。
 */

import { ECardCategory } from "@/types";

export const CATEGORY_COLORS: Record<ECardCategory, { text: string; soft: string }> = {
  [ECardCategory.Temporary]: { text: "#c96f4e", soft: "rgba(201,111,78,0.12)" },
  [ECardCategory.Literature]: { text: "#5c7d99", soft: "rgba(92,125,153,0.13)" },
  [ECardCategory.Permanent]: { text: "#61795f", soft: "rgba(97,121,95,0.14)" },
  [ECardCategory.Theme]: { text: "#a38c4d", soft: "rgba(163,140,77,0.15)" },
};
