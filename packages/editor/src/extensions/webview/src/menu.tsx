import { editorT } from "../../../i18n-runtime";
import { menuText } from "../../../menu-i18n";
import { Edit, FileCode, Maximize2, RefreshCw, Trash2 } from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { Element } from "slate";

import type { EditorCommand, EditorMenuEntry } from "@tau/editor/api";
import { notifierOf } from "@tau/editor/api";

import type { WebviewElement } from "./types";

/**
 * 网页视图块特有的菜单条目（上移/下移/复制等公共条目由内核默认菜单贡献，01 §5.4）。
 * 组件把动作与上传状态注册进 webviewActionsMap，命令与 when/disabled 从中读取。
 */
export const webviewActionsMap = new WeakMap<
  WebviewElement,
  {
    editUrl: () => void;
    selectLocalHtml: () => void;
    fullscreen: () => void;
    refresh: () => void;
    isUploading: () => boolean;
  }
>();

const asWebview = (element: Element | undefined): WebviewElement | null =>
  element?.type === "webview" ? (element as WebviewElement) : null;

export const webviewCommands: EditorCommand[] = [
  {
    id: "tau.webview.edit",
    title: "编辑",
    run: (_editor, ctx) => {
      const element = asWebview(ctx.element);
      if (!element) return;
      webviewActionsMap.get(element)?.editUrl();
    },
  },
  {
    id: "tau.webview.select-local",
    title: "选择本地 HTML",
    run: (_editor, ctx) => {
      const element = asWebview(ctx.element);
      if (!element) return;
      webviewActionsMap.get(element)?.selectLocalHtml();
    },
  },
  {
    id: "tau.webview.fullscreen",
    title: "全屏查看",
    run: (_editor, ctx) => {
      const element = asWebview(ctx.element);
      if (!element) return;
      webviewActionsMap.get(element)?.fullscreen();
    },
  },
  {
    id: "tau.webview.refresh",
    title: "刷新",
    run: (_editor, ctx) => {
      const element = asWebview(ctx.element);
      if (!element) return;
      webviewActionsMap.get(element)?.refresh();
    },
  },
  {
    id: "tau.webview.delete",
    title: "删除",
    run: async (editor, ctx) => {
      const element = asWebview(ctx.element);
      if (!element) return;
      const confirmed = await notifierOf(editor).confirm({
        get title() {
          return editorT(editor, "image.web.confirmDelete");
        },
        get description() {
          return editorT(editor, "image.web.deleteDescription");
        },
        get confirmText() {
          return editorT(editor, "image.delete");
        },
        danger: true,
      });
      if (!confirmed) return;
      const path = ReactEditor.findPath(editor, element);
      Transforms.removeNodes(editor, { at: path });
    },
  },
];

export const webviewMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.webview.edit",
    title: menuText("image.edit"),
    icon: <Edit size={16} />,
    command: "tau.webview.edit",
  },
  {
    id: "tau.webview.select-local",
    title: menuText(ctx =>
      webviewActionsMap.get(ctx.element as WebviewElement)?.isUploading()
        ? "image.loading"
        : "image.web.chooseShort"
    ),
    icon: <FileCode size={16} />,
    command: "tau.webview.select-local",
    disabled: ctx => webviewActionsMap.get(ctx.element as WebviewElement)?.isUploading() ?? false,
  },
  {
    id: "tau.webview.fullscreen",
    title: menuText("image.fullscreen"),
    icon: <Maximize2 size={16} />,
    command: "tau.webview.fullscreen",
  },
  {
    id: "tau.webview.refresh",
    title: menuText("image.refresh"),
    icon: <RefreshCw size={16} />,
    command: "tau.webview.refresh",
  },
  {
    // 覆盖内核默认删除（id 相同）：网页视图删除需要确认
    id: "tau.block.delete",
    title: menuText("image.delete"),
    icon: <Trash2 size={16} />,
    command: "tau.webview.delete",
    group: "block",
    order: 90,
    danger: true,
  },
];
