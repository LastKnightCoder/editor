import type { Translator } from "@tau/i18n";
import type { ProjectsMessageKey } from "@/features/projects/i18n";
import type { MenuEntryList } from "../../shared/menuEntries";
import {
  BookOpen,
  ClipboardCopy,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  FileType,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Maximize2,
  Share2,
  Play,
  Presentation,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import type { PluginEntityPanelTarget } from "@tau/plugins";
import { EProjectItemType, type ProjectItem } from "@/types/project";
import { isElectron } from "@/electron";

type ProjectItemMenuSource = Partial<Pick<ProjectItem, "projectItemType" | "refType">>;

type ProjectItemMenuItems = MenuEntryList;
type ProjectItemMenuItem = ProjectItemMenuItems[number];

const isMenuItem = (item: ProjectItemMenuItem | undefined): item is ProjectItemMenuItem =>
  Boolean(item);

const compactMenuItems = (items: Array<ProjectItemMenuItem | undefined>): ProjectItemMenuItems =>
  items.filter(isMenuItem);

function menuIcon(Icon: LucideIcon) {
  return <Icon className="size-[15px] shrink-0" strokeWidth={1.75} />;
}

export const getProjectItemMoreMenuItems = (
  t: Translator<ProjectsMessageKey>["t"],
  projectItem?: ProjectItemMenuSource | null,
  /** 文档已共享：协作项改「协作成员」（打开成员 Popover） */
  shared = false,
  /** 闪卡复习关掉时不给制卡入口 */
  flashcards = true
): MenuEntryList => {
  if (projectItem?.projectItemType === EProjectItemType.Document) {
    return [
      {
        key: "scene",
        label: t("scene"),
        icon: menuIcon(Presentation),
        children: compactMenuItems([
          { key: "presentation-mode", label: t("present"), icon: menuIcon(Play) },
          { key: "immersive-mode", label: t("immersive"), icon: menuIcon(Maximize2) },
          // 独立窗口为 Electron 专属能力，Web 端不展示入口
          isElectron
            ? {
                key: "open-in-new-window",
                label: t("window"),
                icon: menuIcon(ExternalLink),
              }
            : undefined,
        ]),
      },
      shared
        ? { key: "collaboration", label: t("members"), icon: menuIcon(Users) }
        : { key: "collaboration", label: t("share"), icon: menuIcon(Share2) },
      {
        key: "copy",
        label: t("copy"),
        icon: menuIcon(Copy),
        children: [
          {
            key: "copy-markdown",
            label: t("copy.markdown"),
            icon: menuIcon(ClipboardCopy),
          },
          {
            key: "copy-wechat",
            label: t("copy.wechat"),
            icon: menuIcon(MessageSquare),
          },
        ],
      },
      {
        key: "export",
        label: t("export"),
        icon: menuIcon(Download),
        children: [
          { key: "export-word", label: t("export.word"), icon: menuIcon(FileText) },
          {
            key: "export-markdown",
            label: t("export.markdown"),
            icon: menuIcon(FileText),
          },
          {
            key: "export-image",
            label: t("export.image"),
            icon: menuIcon(ImageIcon),
          },
          {
            key: "export-epub",
            label: "EPUB",
            icon: menuIcon(BookOpen),
          },
          {
            key: "export-pdf",
            label: "PDF",
            icon: menuIcon(FileType),
          },
        ],
      },
      {
        key: "generate",
        label: t("generate"),
        icon: menuIcon(Wand2),
        children: compactMenuItems([
          projectItem?.refType !== "card"
            ? { key: "to-card", label: t("generate.card"), icon: menuIcon(Layers) }
            : undefined,
          flashcards
            ? { key: "ai-flashcard", label: t("generate.ai"), icon: menuIcon(Sparkles) }
            : undefined,
          flashcards
            ? { key: "manual-flashcard", label: t("generate.manual"), icon: menuIcon(CreditCard) }
            : undefined,
        ]),
      },
      { key: "remove-divider", label: "", divider: true },
      {
        key: "remove",
        label: t("delete.document"),
        icon: menuIcon(Trash2),
        danger: true,
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.Whiteboard) {
    return compactMenuItems([
      projectItem?.refType !== "white-board"
        ? {
            key: "to-white-board",
            label: t("generate.board"),
          }
        : undefined,
      {
        key: "remove",
        label: t("delete.board"),
      },
      {
        key: "edit-title",
        label: t("edit.title"),
      },
    ]);
  }

  if (projectItem?.projectItemType === EProjectItemType.VideoNote) {
    return [
      {
        key: "remove",
        label: t("delete.video"),
      },
      {
        key: "edit-title",
        label: t("edit.title"),
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.WebView) {
    return [
      {
        key: "remove",
        label: t("delete.web"),
      },
      {
        key: "edit-title",
        label: t("edit.title"),
      },
      {
        key: "open-in-new-tab",
        label: t("open.app"),
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.TableView) {
    return [
      {
        key: "remove",
        label: t("delete.table"),
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.Pdf) {
    return [
      {
        key: "remove",
        label: t("delete.pdf"),
      },
      {
        key: "edit-title",
        label: t("edit.title"),
      },
    ];
  }

  return [];
};

/** 项目文档对应的插件动作 / 详情区块目标：引用型条目指向它引用的卡片 / 文章，其余类型没有插件动作 */
export function projectItemActionTarget(
  projectItem?: Pick<ProjectItem, "id" | "projectItemType" | "refType" | "refId"> | null
): PluginEntityPanelTarget | null {
  if (projectItem?.projectItemType !== EProjectItemType.Document) return null;
  if (!projectItem.refType) return { kind: "document", id: String(projectItem.id) };
  if (projectItem.refType === "card" || projectItem.refType === "article")
    return { kind: projectItem.refType, id: String(projectItem.refId) };
  return null;
}
