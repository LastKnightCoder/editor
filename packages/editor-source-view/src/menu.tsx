import { Edit3, Maximize2 } from "lucide-react";
import React from "react";
import type { Element } from "slate";

import { defineExtension, type EditorCommand, type EditorMenuEntry } from "@tau/editor/api";

/**
 * PreviewWithEditor 使用方的
 * 共享菜单：组件把「编辑 / 全屏」动作注册进 previewActionsMap，这里提供命令与条目，
 * `when` 按注册表判断——任何块只要注册了动作就免费获得这两条菜单。
 */

export interface PreviewEditorActions {
  edit: () => void;
  fullscreen: () => void;
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
  {
    id: "tau.preview.fullscreen",
    title: "全屏",
    run: (_editor, ctx) => {
      if (ctx.element) previewActionsMap.get(ctx.element)?.fullscreen();
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
  {
    id: "tau.preview.fullscreen",
    title: "全屏",
    icon: <Maximize2 size={16} />,
    command: "tau.preview.fullscreen",
    when: ctx => previewActionsMap.has(ctx.element),
  },
];

export const previewMenuExtension = defineExtension({
  id: "tau.preview-menu",
  commands: previewCommands,
  menu: previewMenuItems,
});
