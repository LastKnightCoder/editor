import type { MenuProps } from "antd";

import { EProjectItemType, type ProjectItem } from "@/types/project";

type ProjectItemMenuSource = Partial<
  Pick<ProjectItem, "projectItemType" | "refType" | "podcast">
>;

type ProjectItemMenuItems = NonNullable<MenuProps["items"]>;
type ProjectItemMenuItem = ProjectItemMenuItems[number];

const isMenuItem = (
  item: ProjectItemMenuItem | undefined,
): item is ProjectItemMenuItem => Boolean(item);

const compactMenuItems = (
  items: Array<ProjectItemMenuItem | undefined>,
): ProjectItemMenuItems => items.filter(isMenuItem);

export const getProjectItemMoreMenuItems = (
  projectItem?: ProjectItemMenuSource | null,
): MenuProps["items"] => {
  if (projectItem?.projectItemType === EProjectItemType.Document) {
    return compactMenuItems([
      projectItem?.refType !== "card"
        ? {
            key: "to-card",
            label: "建立卡片",
          }
        : undefined,
      {
        key: "create-flashcard",
        label: "制作闪卡",
        children: [
          { key: "manual-flashcard", label: "手动制卡" },
          { key: "ai-flashcard", label: "AI 制卡" },
        ],
      },
      {
        key: "generate-podcast",
        label: projectItem?.podcast ? "编辑播客" : "生成播客",
      },
      {
        key: "presentation-mode",
        label: "演示模式",
      },
      {
        key: "copy",
        label: "复制文档",
        children: [
          {
            key: "copy-markdown",
            label: "Markdown",
          },
          {
            key: "copy-wechat",
            label: "微信公众号",
          },
        ],
      },
      {
        key: "export",
        label: "导出文档",
        children: [
          {
            key: "export-markdown",
            label: "Markdown",
          },
          {
            key: "export-image",
            label: "图片",
          },
          {
            key: "export-epub",
            label: "EPUB",
          },
          {
            key: "export-pdf",
            label: "PDF",
          },
        ],
      },
      {
        key: "open-in-new-window",
        label: "窗口打开",
      },
      {
        key: "open-in-right-sidebar",
        label: "右侧打开",
      },
      {
        key: "remove",
        label: "删除文档",
      },
    ]);
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

  if (projectItem?.projectItemType === EProjectItemType.AudioNote) {
    return [
      {
        key: "remove",
        label: "删除音频",
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
        label: "新 Tab 打开",
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

  if (projectItem?.projectItemType === EProjectItemType.Epub) {
    return [
      {
        key: "remove",
        label: "删除电子书",
      },
      {
        key: "edit-title",
        label: "编辑标题",
      },
    ];
  }

  return [];
};
