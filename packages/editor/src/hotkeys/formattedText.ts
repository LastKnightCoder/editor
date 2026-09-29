import { getCurrentTextNode } from "../utils";
import { Editor, Range, Transforms } from "slate";
import { FormattedText, Mark, IHotKeyConfig } from "../types";
import type { EditorCommand, EditorCommandContext, EditorHotkey } from "../api/command";

import React from "react";

const markCommand = (mark: Mark, id: string, title: string): EditorCommand => ({
  id,
  title,
  run: (editor: Editor, ctx: EditorCommandContext) => {
    const node = getCurrentTextNode(editor)[0];
    if (node && node.type === "formatted") {
      const marks = Editor.marks(editor);
      if (marks && (marks as FormattedText)[mark]) {
        Editor.removeMark(editor, mark);
      } else {
        Editor.addMark(editor, mark, true);
      }
      const { selection } = editor;
      if (selection && !Range.isCollapsed(selection)) {
        Transforms.collapse(editor, { edge: "end" });
        Editor.removeMark(editor, mark);
      }
      // 热键触发时拦截浏览器默认行为；菜单等非热键路径没有事件可拦
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
    }
  },
});

export const formattedTextCommands: EditorCommand[] = [
  markCommand("bold", "tau.mark.bold", "加粗"),
  markCommand("italic", "tau.mark.italic", "斜体"),
  markCommand("underline", "tau.mark.underline", "下划线"),
  markCommand("strikethrough", "tau.mark.strikethrough", "删除线"),
  markCommand("highlight", "tau.mark.highlight", "高亮"),
  markCommand("code", "tau.mark.code", "行内代码"),
];

export const formattedTextHotkeys: EditorHotkey[] = [
  { key: "mod+b", command: "tau.mark.bold" },
  { key: "mod+i", command: "tau.mark.italic" },
  { key: "mod+u", command: "tau.mark.underline" },
  { key: "mod+shift+s", command: "tau.mark.strikethrough" },
  { key: "mod+m", command: "tau.mark.highlight" },
  { key: "mod+e", command: "tau.mark.code" },
];

export const quitFormattedMarks: IHotKeyConfig[] = [
  {
    hotKey: "escape",
    action: (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: n => n.type === "formatted",
        });
        if (match) {
          ["bold", "italic", "underline", "highlight", "code", "strikethrough", "color"].forEach(
            type => {
              Editor.removeMark(editor, type);
              // 阻止默认行为
              event.preventDefault();
              event.stopPropagation();
            }
          );
        }
      }
    },
  },
];

// 这两个是收起卡片和展开卡片列表的快捷键
export const modMove: IHotKeyConfig[] = [
  {
    hotKey: "mod+right",
    action: (_editor: Editor, e) => {
      // 阻止默认行为
      e.preventDefault();
    },
  },
  {
    hotKey: "mod+left",
    action: (_editor: Editor, e) => {
      // 阻止默认行为
      e.preventDefault();
    },
  },
];
