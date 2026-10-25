import { Edit3, type LucideIcon } from "lucide-react";
import React from "react";
import type { Element } from "slate";

import { defineExtension, type EditorCommand, type EditorMenuEntry } from "@tau/editor/api";

/**
 * PreviewWithEditor 使用方的
 * 共享菜单：组件把编辑动作注册进 previewActionsMap，这里按注册表提供编辑入口。
 */

export interface PreviewEditorActions {
  /** 块类型名与图标（触屏配件栏的上下文标签） */
  title: string;
  icon: LucideIcon;
  /** 进入源码编辑：桌面原位展开，触屏打开源码页 */
  edit: () => void;
  copySource: () => void;
  /** 当前不可编辑（只读文档或宿主禁止编辑该类型） */
  readOnly: boolean;
}

export const previewActionsMap = new WeakMap<Element, PreviewEditorActions>();

/** 宿主读取源码预览块登记的动作（如触屏配件栏）；未登记返回 undefined */
export const getPreviewEditorActions = (element: Element): PreviewEditorActions | undefined =>
  previewActionsMap.get(element);

const previewCommands: EditorCommand[] = [
  {
    id: "tau.preview.edit",
    title: "编辑",
    run: (_editor, ctx) => {
      if (ctx.element) previewActionsMap.get(ctx.element)?.edit();
    },
  },
];

const previewMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.preview.edit",
    title: "编辑",
    icon: React.createElement(Edit3, { size: 16 }),
    command: "tau.preview.edit",
    when: ctx => previewActionsMap.has(ctx.element),
  },
];

export const previewMenuExtension = defineExtension({
  id: "tau.preview-menu",
  commands: previewCommands,
  menu: previewMenuItems,
});
