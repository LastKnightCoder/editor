import type { Translator } from "@tau/i18n";
import type { ProjectsMessageKey } from "@/features/projects/i18n";
import type { MenuEntryList } from "../menuEntries";

/** 视频插件入口的菜单键前缀，后接插件 ID */
export const VIDEO_PLUGIN_MENU_PREFIX = "add-video-plugin-note-project-item:";

/** 添加菜单：「添加视频」下每个启用的视频插件一个入口，名称取插件名。 */
export function buildAddMenuItems(
  t: Translator<ProjectsMessageKey>["t"],
  videoProviders: readonly { id: string; name: string }[]
): MenuEntryList {
  const baseMenuItems: MenuEntryList = [
    {
      key: "add-project-item",
      label: t("add.document"),
    },
    {
      key: "add-white-board-project-item",
      label: t("add.board"),
    },
    {
      key: "add-video-note-project-item",
      label: t("add.video"),
      children: [
        {
          key: "add-local-video-note-project-item",
          label: t("add.localVideo"),
        },
        {
          key: "add-remote-video-note-project-item",
          label: t("add.remoteVideo"),
        },
      ],
    },
    {
      key: "add-webview-project-item",
      label: t("add.web"),
    },
    {
      key: "add-table-project-item",
      label: t("add.table"),
    },
    {
      key: "add-pdf-project-item",
      label: t("add.pdf"),
      children: [
        { key: "add-local-pdf-project-item", label: t("add.localPdf") },
        { key: "add-remote-pdf-project-item", label: t("add.remotePdf") },
        { key: "link-pdf-project-item", label: t("link.pdf") },
      ],
    },
    {
      key: "link-card-project-item",
      label: t("link.card"),
    },
    {
      key: "link-white-board-project-item",
      label: t("link.board"),
    },
    {
      key: "import-markdown",
      label: t("import.markdown"),
    },
  ];

  return baseMenuItems.map(item =>
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
