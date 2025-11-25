import type { ReactNode } from "react";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { EHighlightColor } from "@/types";
import {
  LuHighlighter,
  LuUnderline,
  LuWaves,
  LuStrikethrough,
} from "react-icons/lu";

export interface AnnotationColorOption {
  id: EHighlightColor;
  label: string;
  value: string;
}

export interface AnnotationStyleOption {
  label: string;
  value: PdfAnnotationSubtype;
  icon: ReactNode;
}

export const TEXT_MARKUP_SUBTYPES = new Set<PdfAnnotationSubtype>([
  PdfAnnotationSubtype.HIGHLIGHT,
  PdfAnnotationSubtype.UNDERLINE,
  PdfAnnotationSubtype.SQUIGGLY,
  PdfAnnotationSubtype.STRIKEOUT,
]);

export const ANNOTATION_COLOR_OPTIONS: AnnotationColorOption[] = [
  { id: EHighlightColor.Yellow, label: "黄色", value: "#fde58b" },
  { id: EHighlightColor.Red, label: "红色", value: "#ffb3b3" },
  { id: EHighlightColor.Green, label: "绿色", value: "#b2f1b7" },
  { id: EHighlightColor.Blue, label: "蓝色", value: "#b8d3ff" },
  { id: EHighlightColor.Purple, label: "紫色", value: "#dcb8ff" },
  { id: EHighlightColor.Pink, label: "粉色", value: "#ffc4e1" },
];

export const ANNOTATION_STYLE_OPTIONS: AnnotationStyleOption[] = [
  {
    label: "高亮",
    value: PdfAnnotationSubtype.HIGHLIGHT,
    icon: LuHighlighter({ size: 16 }),
  },
  {
    label: "下划线",
    value: PdfAnnotationSubtype.UNDERLINE,
    icon: LuUnderline({ size: 16 }),
  },
  {
    label: "波浪线",
    value: PdfAnnotationSubtype.SQUIGGLY,
    icon: LuWaves({ size: 16 }),
  },
  {
    label: "删除线",
    value: PdfAnnotationSubtype.STRIKEOUT,
    icon: LuStrikethrough({ size: 16 }),
  },
];

// EHighlightColor 到颜色值的映射
export const HIGHLIGHT_COLORS: Record<EHighlightColor, string> = {
  [EHighlightColor.Yellow]: "#fde58b",
  [EHighlightColor.Red]: "#ffb3b3",
  [EHighlightColor.Green]: "#b2f1b7",
  [EHighlightColor.Blue]: "#b8d3ff",
  [EHighlightColor.Purple]: "#dcb8ff",
  [EHighlightColor.Pink]: "#ffc4e1",
};
