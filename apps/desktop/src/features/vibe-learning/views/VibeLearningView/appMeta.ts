import { notebookTranslator } from "../../i18n";
/** 生成应用与产物类型的图标 / 名称（目录、阅读区、生成宿主共用） */

import {
  CircleHelp,
  FileBarChart,
  FileText,
  Highlighter,
  ListOrdered,
  Network,
  PenLine,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { VLNoteType } from "@/types/vibe-learning";

export type GenerateAppKey =
  | "outline"
  | "highlights"
  | "article"
  | "mindmap"
  | "ppt"
  | "report"
  | "quiz";

export const GENERATE_APPS: {
  key: GenerateAppKey;
  toolLabel: string;
  label: string;
  icon: LucideIcon;
}[] = [
  {
    key: "outline",
    toolLabel: "学习大纲",
    get label() {
      return notebookTranslator.t("kind.outline");
    },
    icon: ListOrdered,
  },
  {
    key: "highlights",
    toolLabel: "重点提炼",
    get label() {
      return notebookTranslator.t("kind.highlights");
    },
    icon: Highlighter,
  },
  {
    key: "article",
    toolLabel: "文章",
    get label() {
      return notebookTranslator.t("kind.article");
    },
    icon: FileText,
  },
  {
    key: "mindmap",
    toolLabel: "思维导图",
    get label() {
      return notebookTranslator.t("kind.mindmap");
    },
    icon: Network,
  },
  {
    key: "ppt",
    toolLabel: "PPT",
    get label() {
      return notebookTranslator.t("kind.ppt");
    },
    icon: Presentation,
  },
  {
    key: "report",
    toolLabel: "报告",
    get label() {
      return notebookTranslator.t("kind.report");
    },
    icon: FileBarChart,
  },
  {
    key: "quiz",
    toolLabel: "测验",
    get label() {
      return notebookTranslator.t("kind.quiz");
    },
    icon: CircleHelp,
  },
];

export const NOTE_ICONS: Record<VLNoteType, LucideIcon> = {
  note: PenLine,
  outline: ListOrdered,
  highlights: Highlighter,
  article: FileText,
  mindmap: Network,
  ppt: Presentation,
  report: FileBarChart,
};
