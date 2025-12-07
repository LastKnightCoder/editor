import {
  Maximize2,
  Crop,
  AlignLeft,
  AlignCenter,
  AlignRight,
  FileText,
  Copy,
  Link2,
  Trash2,
} from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { App } from "antd";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import type { FileService, ImageElement } from "../../../types";
import { imageActionsMap } from "../index";

const resolveLocalPath = (url: string, fileService?: FileService) => {
  if (!url.startsWith("~") || !fileService?.getHomeDir) {
    return null;
  }
  const homeDir = fileService.getHomeDir();
  return `${homeDir}${url.slice(1)}`;
};

async function copyImageToClipboard(
  element: ImageElement,
  message: ReturnType<typeof App.useApp>["message"],
  fileService?: FileService,
) {
  try {
    const actions = imageActionsMap.get(element);
    if (actions?.getImageBlob) {
      try {
        const blob = await actions.getImageBlob();
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob,
            }),
          ]);
          message.success("图片复制成功");
          return;
        }
      } catch (error) {
        console.warn("从 img 元素获取图片失败，尝试其他方式:", error);
      }
    }

    const url = element.url;
    const localPath = resolveLocalPath(url, fileService);

    if (localPath) {
      await navigator.clipboard.writeText(localPath);
      message.success("图片路径复制成功");
      return;
    }

    if (url.startsWith("local://")) {
      const normalized = url.replace("local://", "");
      await navigator.clipboard.writeText(normalized);
      message.success("图片路径复制成功");
      return;
    }

    await navigator.clipboard.writeText(url);
    message.warning("无法直接复制图片，已复制图片链接");
  } catch (error) {
    console.error("复制图片失败:", error);
    message.error("复制图片失败");
  }
}

async function copyImageLink(
  url: string,
  message: ReturnType<typeof App.useApp>["message"],
  fileService?: FileService,
) {
  try {
    const localPath = resolveLocalPath(url, fileService);
    if (localPath) {
      await navigator.clipboard.writeText(localPath);
      message.success("链接复制成功");
      return;
    }

    if (url.startsWith("local://")) {
      const normalized = url.replace("local://", "");
      await navigator.clipboard.writeText(normalized);
      message.success("链接复制成功");
      return;
    }

    await navigator.clipboard.writeText(url);
    message.success("链接复制成功");
  } catch (error) {
    console.error("复制链接失败:", error);
    message.error("复制链接失败");
  }
}

export function buildImageMenuItems(
  params: BuildMenuParams<ImageElement>,
  message?: ReturnType<typeof App.useApp>["message"],
): ContextMenuItem[] {
  const { element, editor } = params;
  const fileService = editor.services?.file;

  const menuItems: ContextMenuItem[] = [];

  menuItems.push({
    key: "fullscreen",
    label: "全屏预览",
    icon: <Maximize2 size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      actions?.showOverview();
    },
  });

  menuItems.push({
    key: "crop",
    label: "裁剪图片",
    icon: <Crop size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      actions?.startCrop();
    },
  });

  const currentAlign = element.align || "center";
  menuItems.push({
    key: "align",
    label: "对齐方式",
    icon:
      currentAlign === "left" ? (
        <AlignLeft size={16} />
      ) : currentAlign === "right" ? (
        <AlignRight size={16} />
      ) : (
        <AlignCenter size={16} />
      ),
    children: [
      {
        key: "align-left",
        label: "左对齐",
        icon: <AlignLeft size={16} />,
        disabled: currentAlign === "left",
        onSelect: () => {
          const path = ReactEditor.findPath(editor, element);
          Transforms.setNodes(editor, { align: "left" as const }, { at: path });
        },
      },
      {
        key: "align-center",
        label: "居中",
        icon: <AlignCenter size={16} />,
        disabled: currentAlign === "center",
        onSelect: () => {
          const path = ReactEditor.findPath(editor, element);
          Transforms.setNodes(
            editor,
            { align: "center" as const },
            { at: path },
          );
        },
      },
      {
        key: "align-right",
        label: "右对齐",
        icon: <AlignRight size={16} />,
        disabled: currentAlign === "right",
        onSelect: () => {
          const path = ReactEditor.findPath(editor, element);
          Transforms.setNodes(
            editor,
            { align: "right" as const },
            { at: path },
          );
        },
      },
    ],
  });

  menuItems.push({
    key: "add-description",
    label: element.description ? "编辑描述" : "添加描述",
    icon: <FileText size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      actions?.showDescEditor();
    },
  });

  if (message) {
    menuItems.push({
      key: "copy-image",
      label: "复制图片",
      icon: <Copy size={16} />,
      onSelect: async () => {
        await copyImageToClipboard(element, message, fileService);
      },
    });

    menuItems.push({
      key: "copy-link",
      label: "复制链接",
      icon: <Link2 size={16} />,
      onSelect: async () => {
        await copyImageLink(element.url, message, fileService);
      },
    });
  }

  menuItems.push({
    key: "delete",
    label: "删除",
    icon: <Trash2 size={16} />,
    danger: true,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      actions?.deleteImage();
    },
  });

  return menuItems;
}
