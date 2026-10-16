/** 微信读书域的样式映射（纯类名，供组件共用） */

import { cn } from "@tau/ui";
import type { HighlightColor, HighlightStyle } from "../model";

/** 书名 / 划线原文的衬线字体（阅读感；系统没有时回落无衬线） */
export const SERIF = "font-['Songti_SC','STSong','Noto_Serif_SC','Source_Han_Serif_SC',serif]";

/* 微信读书颜色 → 主题数据色（红 tag-5 / 紫 tag-3 / 蓝 tag-2 / 绿 tag-1 / 黄 tag-4） */
export const HIGHLIGHT_DOT: Record<HighlightColor, string> = {
  1: "bg-tag-5",
  2: "bg-tag-3",
  3: "bg-tag-2",
  4: "bg-tag-1",
  5: "bg-tag-4",
};
const MARKER_BG: Record<HighlightColor, string> = {
  1: "bg-tag-5/30",
  2: "bg-tag-3/30",
  3: "bg-tag-2/30",
  4: "bg-tag-1/30",
  5: "bg-tag-4/35",
};
const LINE_COLOR: Record<HighlightColor, string> = {
  1: "decoration-tag-5",
  2: "decoration-tag-3",
  3: "decoration-tag-2",
  4: "decoration-tag-1",
  5: "decoration-tag-4",
};

/** 还原微信读书的划线样式：0 下划线 / 1 马克笔 / 2 波浪线 */
export function markClass(style: HighlightStyle, color: HighlightColor): string {
  const base = "[box-decoration-break:clone] px-px";
  if (style === 1) return cn(base, "rounded-[3px]", MARKER_BG[color]);
  return cn(
    base,
    "underline underline-offset-[5px]",
    style === 2 ? "decoration-wavy decoration-[1.5px]" : "decoration-[2px]",
    LINE_COLOR[color]
  );
}
