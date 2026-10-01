import { Settings } from "lucide-react";

import { type EditorCommand } from "@tau/editor/api";
import { type EditorMenuEntry } from "@tau/editor/api";
import { type ImageGalleryElement } from "../../../types/index";

/** ImageGallery 组件注册的运行时动作（打开设置面板） */
export const imageGalleryActionsMap = new WeakMap<
  ImageGalleryElement,
  {
    openSettings: () => void;
  }
>();

/** 画廊块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const imageGalleryCommands: EditorCommand[] = [
  {
    id: "tau.image-gallery.open-settings",
    title: "画廊设置",
    run: (_editor, ctx) => {
      if (ctx.element?.type !== "image-gallery") return;
      imageGalleryActionsMap.get(ctx.element as ImageGalleryElement)?.openSettings();
    },
  },
];

export const imageGalleryMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.image-gallery.open-settings",
    title: "设置",
    icon: <Settings size={16} />,
    command: "tau.image-gallery.open-settings",
  },
];
