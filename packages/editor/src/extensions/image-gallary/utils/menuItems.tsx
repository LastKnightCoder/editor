import { Settings, Trash2 } from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import type { ImageGalleryElement } from "../../../types";

// 用于存储 ImageGallery 组件的 actions，以便菜单项调用
export const imageGalleryActionsMap = new WeakMap<
  ImageGalleryElement,
  {
    openSettings: () => void;
  }
>();

export function buildImageGalleryMenuItems(
  params: BuildMenuParams<ImageGalleryElement>,
): ContextMenuItem[] {
  const { element, editor, path } = params;

  const menuItems: ContextMenuItem[] = [];

  // 设置
  menuItems.push({
    key: "settings",
    label: "设置",
    icon: <Settings size={16} />,
    onSelect: () => {
      const actions = imageGalleryActionsMap.get(element);
      actions?.openSettings();
    },
  });

  // 删除
  menuItems.push({
    key: "delete",
    label: "删除",
    icon: <Trash2 size={16} />,
    danger: true,
    onSelect: () => {
      Transforms.removeNodes(editor, { at: path });
    },
  });

  return menuItems;
}
