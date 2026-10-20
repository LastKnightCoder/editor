import { Edit3 } from "lucide-react";
import React from "react";
import type { Element } from "slate";

import { defineExtension, type EditorCommand, type EditorMenuEntry } from "@tau/editor/api";

/**
 * PreviewWithEditor 使用方的
 * 共享菜单：组件把编辑动作注册进 previewActionsMap，这里按注册表提供编辑入口。
 */

export interface PreviewEditorActions {
  edit: () => void;
}

export const previewActionsMap = new WeakMap<Element, PreviewEditorActions>();

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
