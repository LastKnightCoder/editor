/** 生成应用与产物类型的图标 / 名称（目录、阅读区、生成宿主共用） */

import {
  CircleHelp,
  FileBarChart,
  FileText,
  Highlighter,
  ListOrdered,
  Mic,
  Network,
  PenLine,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { VLNoteType } from "@/types/vibe-learning";

export type GenerateAppKey =
  "outline" | "highlights" | "article" | "mindmap" | "ppt" | "report" | "quiz" | "podcast";

export const GENERATE_APPS: { key: GenerateAppKey; label: string; icon: LucideIcon }[] = [
  { key: "outline", label: "学习大纲", icon: ListOrdered },
  { key: "highlights", label: "重点提炼", icon: Highlighter },
  { key: "article", label: "文章", icon: FileText },
  { key: "mindmap", label: "思维导图", icon: Network },
  { key: "ppt", label: "PPT", icon: Presentation },
  { key: "report", label: "报告", icon: FileBarChart },
  { key: "quiz", label: "测验", icon: CircleHelp },
  { key: "podcast", label: "播客", icon: Mic },
];

export const NOTE_ICONS: Record<VLNoteType, LucideIcon> = {
  note: PenLine,
  outline: ListOrdered,
  highlights: Highlighter,
  article: FileText,
  mindmap: Network,
  ppt: Presentation,
  report: FileBarChart,
  podcast: Mic,
};
