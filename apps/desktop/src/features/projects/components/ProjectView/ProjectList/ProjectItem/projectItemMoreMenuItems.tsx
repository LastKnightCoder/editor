import type { MenuEntryList } from "../../shared/menuEntries";
import {
  BookOpen,
  ClipboardCopy,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileAudio,
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

import { EProjectItemType, type ProjectItem } from "@/types/project";
import { isElectron } from "@/electron";

type ProjectItemMenuSource = Partial<Pick<ProjectItem, "projectItemType" | "refType" | "podcast">>;

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
  projectItem?: ProjectItemMenuSource | null,
  /** 文档已共享：协作项改「协作成员」（打开成员 Popover） */
  shared = false
): MenuEntryList => {
  if (projectItem?.projectItemType === EProjectItemType.Document) {
    return [
      {
        key: "scene",
        label: "场景",
        icon: menuIcon(Presentation),
        children: compactMenuItems([
          { key: "presentation-mode", label: "演示模式", icon: menuIcon(Play) },
          { key: "immersive-mode", label: "沉浸模式", icon: menuIcon(Maximize2) },
          // 独立窗口为 Electron 专属能力，Web 端不展示入口
          isElectron
            ? {
                key: "open-in-new-window",
                label: "在新窗口打开",
                icon: menuIcon(ExternalLink),
              }
            : undefined,
        ]),
      },
      shared
        ? { key: "collaboration", label: "协作成员", icon: menuIcon(Users) }
        : { key: "collaboration", label: "发起协作", icon: menuIcon(Share2) },
      {
        key: "copy",
        label: "复制",
        icon: menuIcon(Copy),
        children: [
          {
            key: "copy-markdown",
            label: "复制 Markdown",
            icon: menuIcon(ClipboardCopy),
          },
          {
            key: "copy-wechat",
            label: "复制公众号格式",
            icon: menuIcon(MessageSquare),
          },
        ],
      },
      {
        key: "export",
        label: "导出",
        icon: menuIcon(Download),
        children: [
          {
            key: "export-markdown",
            label: "Markdown 文件",
            icon: menuIcon(FileText),
          },
          {
            key: "export-image",
            label: "图片",
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
        label: "生成",
        icon: menuIcon(Wand2),
        children: compactMenuItems([
          projectItem?.refType !== "card"
            ? { key: "to-card", label: "转为卡片（同一份正文）", icon: menuIcon(Layers) }
            : undefined,
          { key: "ai-flashcard", label: "AI 制卡（闪卡）", icon: menuIcon(Sparkles) },
          { key: "manual-flashcard", label: "手动制卡（闪卡）", icon: menuIcon(CreditCard) },
          {
            key: "generate-podcast",
            label: projectItem?.podcast ? "编辑播客" : "生成播客",
            icon: menuIcon(FileAudio),
          },
        ]),
      },
      { key: "remove-divider", label: "", divider: true },
      {
        key: "remove",
        label: "删除文档",
        icon: menuIcon(Trash2),
        danger: true,
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.WhiteBoard) {
    return compactMenuItems([
      projectItem?.refType !== "white-board"
        ? {
            key: "to-white-board",
            label: "建立白板",
          }
        : undefined,
      {
        key: "remove",
        label: "删除白板",
      },
      {
        key: "edit-title",
        label: "编辑标题",
      },
    ]);
  }

  if (projectItem?.projectItemType === EProjectItemType.VideoNote) {
    return [
      {
        key: "remove",
        label: "删除视频",
      },
      {
        key: "edit-title",
        label: "编辑标题",
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.WebView) {
    return [
      {
        key: "remove",
        label: "删除网页",
      },
      {
        key: "edit-title",
        label: "编辑标题",
      },
      {
        key: "open-in-new-tab",
        label: "在应用内打开",
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.TableView) {
    return [
      {
        key: "remove",
        label: "删除表格",
      },
    ];
  }

  if (projectItem?.projectItemType === EProjectItemType.Pdf) {
    return [
      {
        key: "remove",
        label: "删除 PDF",
      },
      {
        key: "edit-title",
        label: "编辑标题",
      },
    ];
  }

  return [];
};
