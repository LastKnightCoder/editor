import { Layers, FileText, Folder } from "lucide-react";
import { TabConfig } from "./types";

/**
 * Tab 配置
 */
export const TABS: TabConfig[] = [
  {
    key: "card",
    labelKey: "type.card",
    descriptionKey: "type.cardHint",
    icon: Layers,
  },
  {
    key: "article",
    labelKey: "type.article",
    descriptionKey: "type.articleHint",
    icon: FileText,
  },
  {
    key: "project",
    labelKey: "type.project",
    descriptionKey: "type.projectHint",
    icon: Folder,
  },
];
