import type { MenuEntryList } from "../menuEntries";

/** 视频插件入口的菜单键前缀，后接插件 ID */
export const VIDEO_PLUGIN_MENU_PREFIX = "add-video-plugin-note-project-item:";

const BASE_MENU_ITEMS: MenuEntryList = [
  {
    key: "add-project-item",
    label: "添加文档",
  },
  {
    key: "add-white-board-project-item",
    label: "添加白板",
  },
  {
    key: "add-video-note-project-item",
    label: "添加视频",
    children: [
      {
        key: "add-local-video-note-project-item",
        label: "本地视频",
      },
      {
        key: "add-remote-video-note-project-item",
        label: "远程视频",
      },
    ],
  },
  {
    key: "add-webview-project-item",
    label: "添加网页",
  },
  {
    key: "add-table-project-item",
    label: "添加表格",
  },
  {
    key: "add-pdf-project-item",
    label: "添加 PDF",
    children: [
      { key: "add-local-pdf-project-item", label: "本地 PDF" },
      { key: "add-remote-pdf-project-item", label: "远程 PDF" },
      { key: "link-pdf-project-item", label: "关联已有 PDF" },
    ],
  },
  {
    key: "link-card-project-item",
    label: "关联卡片",
  },
  {
    key: "link-white-board-project-item",
    label: "关联白板",
  },
  {
    key: "import-markdown",
    label: "导入Markdown",
  },
];

/** 添加菜单：「添加视频」下每个启用的视频插件一个入口，名称取插件名。 */
export function buildAddMenuItems(
  videoProviders: readonly { id: string; name: string }[]
): MenuEntryList {
  return BASE_MENU_ITEMS.map(item =>
    item.key === "add-video-note-project-item" && item.children
      ? {
          ...item,
          children: [
            ...item.children,
            ...videoProviders.map(provider => ({
              key: `${VIDEO_PLUGIN_MENU_PREFIX}${provider.id}`,
              label: provider.name,
            })),
          ],
        }
      : item
  );
}
