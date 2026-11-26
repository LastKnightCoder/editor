import type { Translator } from "@tau/i18n";
import type { MobileProjectsKey } from "./i18n";
// 项目节点的八种类型：图标 + 语义色
import { FileText, Globe, FileDown, Clapperboard, Presentation, Table2 } from "lucide-react";
import type { ProjectItem } from "../../types";

export type ProjectItemTypeMeta = {
  label: string;
  icon: typeof FileText;
  className: string;
};

const TYPE_META: Record<
  string,
  Omit<ProjectItemTypeMeta, "label"> & { labelKey: MobileProjectsKey }
> = {
  document: { labelKey: "type.document", icon: FileText, className: "bg-tag-2-soft text-tag-2" },
  "white-board": {
    labelKey: "type.white-board",
    icon: Presentation,
    className: "bg-tag-5-soft text-tag-5",
  },
  "video-note": {
    labelKey: "type.video-note",
    icon: Clapperboard,
    className: "bg-tag-3-soft text-tag-3",
  },
  "web-view": { labelKey: "type.web-view", icon: Globe, className: "bg-tag-4-soft text-tag-4" },
  "table-view": {
    labelKey: "type.table-view",
    icon: Table2,
    className: "bg-tag-2-soft text-tag-2",
  },
  pdf: { labelKey: "type.pdf", icon: FileDown, className: "bg-tag-5-soft text-tag-5" },
};

export function projectItemTypeMeta(
  item: ProjectItem,
  t: Translator<MobileProjectsKey>["t"]
): ProjectItemTypeMeta {
  if (item.refType === "card") {
    return { label: t("type.card"), icon: FileText, className: "bg-accent-soft text-accent-text" };
  }
  if (item.refType === "article") {
    return { label: t("type.article"), icon: FileText, className: "bg-tag-5-soft text-tag-5" };
  }
  const type = item.projectItemType || "document";
  const { labelKey, ...meta } = TYPE_META[type] ?? TYPE_META.document;
  return { ...meta, label: t(labelKey) };
}

export function addableItemTypes(
  t: Translator<MobileProjectsKey>["t"]
): Array<{ type: string; meta: ProjectItemTypeMeta; soon: boolean }> {
  return Object.entries(TYPE_META).map(([type, { labelKey, ...meta }]) => ({
    type,
    meta: { ...meta, label: t(labelKey) },
    soon: type !== "document",
  }));
}
