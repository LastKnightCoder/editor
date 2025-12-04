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
import { ImageElement } from "../../../types";
import { imageActionsMap } from "@/components/Editor/extensions/image";
import { getHomeDir } from "@/commands/file";

/**
 * 复制图片到剪贴板
 */
async function copyImageToClipboard(
  element: ImageElement,
  message: ReturnType<typeof App.useApp>["message"],
) {
  try {
    // 优先尝试从已加载的 img 元素获取图片内容
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

    // 如果是本地文件路径（~ 开头），转换为绝对路径后复制
    if (url.startsWith("~")) {
      const homeDir = await getHomeDir();
      const absolutePath = `${homeDir}${url.slice(1)}`;
      await navigator.clipboard.writeText(absolutePath);
      message.success("图片路径复制成功");
      return;
    }

    // 如果是 local:// 协议
    if (url.startsWith("local://")) {
      const localPath = url.replace("local://", "");
      await navigator.clipboard.writeText(localPath);
      message.success("图片路径复制成功");
      return;
    }

    // HTTP/HTTPS 地址，降级到复制链接
    await navigator.clipboard.writeText(url);
    message.warning("无法直接复制图片，已复制图片链接");
  } catch (error) {
    console.error("复制图片失败:", error);
    message.error("复制图片失败");
  }
}

/**
 * 复制图片链接
 */
async function copyImageLink(
  url: string,
  message: ReturnType<typeof App.useApp>["message"],
) {
  try {
    // 如果是本地文件路径（以 ~ 开头），转换为绝对路径
    if (url.startsWith("~")) {
      const homeDir = await getHomeDir();
      const absolutePath = `${homeDir}${url.slice(1)}`;
      await navigator.clipboard.writeText(absolutePath);
      message.success("链接复制成功");
      return;
    }

    // 如果是 local:// 协议，去掉前缀
    if (url.startsWith("local://")) {
      const localPath = url.replace("local://", "");
      await navigator.clipboard.writeText(localPath);
      message.success("链接复制成功");
      return;
    }

    // 其它情况直接复制 url
    await navigator.clipboard.writeText(url);
    message.success("链接复制成功");
  } catch (error) {
    console.error("复制链接失败:", error);
    message.error("复制链接失败");
  }
}

/**
 * 构建图片菜单项
 */
export function buildImageMenuItems(
  params: BuildMenuParams<ImageElement>,
  message?: ReturnType<typeof App.useApp>["message"],
): ContextMenuItem[] {
  const { element, editor } = params;

  const menuItems: ContextMenuItem[] = [];

  // 全屏预览
  menuItems.push({
    key: "fullscreen",
    label: "全屏预览",
    icon: <Maximize2 size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      if (actions) {
        actions.showOverview();
      }
    },
  });

  // 裁剪图片
  menuItems.push({
    key: "crop",
    label: "裁剪图片",
    icon: <Crop size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      if (actions) {
        actions.startCrop();
      }
    },
  });

  // 对齐方式（二级菜单）
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

  // 添加描述
  menuItems.push({
    key: "add-description",
    label: element.description ? "编辑描述" : "添加描述",
    icon: <FileText size={16} />,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      if (actions) {
        actions.showDescEditor();
      }
    },
  });

  // 复制图片
  if (message) {
    menuItems.push({
      key: "copy-image",
      label: "复制图片",
      icon: <Copy size={16} />,
      onSelect: async () => {
        await copyImageToClipboard(element, message);
      },
    });

    // 复制链接
    menuItems.push({
      key: "copy-link",
      label: "复制链接",
      icon: <Link2 size={16} />,
      onSelect: async () => {
        await copyImageLink(element.url, message);
      },
    });
  }

  // 删除
  menuItems.push({
    key: "delete",
    label: "删除",
    icon: <Trash2 size={16} />,
    danger: true,
    onSelect: () => {
      const actions = imageActionsMap.get(element);
      if (actions) {
        actions.deleteImage();
      }
    },
  });

  return menuItems;
}
