import { getCurrentTextNode } from "@tau/editor/api";
import { Editor, Range, Transforms } from "slate";
import { FormattedText } from "@tau/markdown/model";
import { Mark } from "./types.ts";
import { type EditorCommand, type EditorCommandContext, type EditorHotkey } from "@tau/editor/api";
import { ReactEditor } from "slate-react";

const markCommand = (
  mark: Mark,
  id: string,
  title: string,
  value: FormattedText[Mark] = true
): EditorCommand => ({
  id,
  title,
  when: editor => !ReactEditor.isReadOnly(editor),
  run: (editor: Editor, ctx: EditorCommandContext) => {
    const node = getCurrentTextNode(editor)?.[0];
    if (node && node.type === "formatted") {
      const marks = Editor.marks(editor);
      if (marks && (marks as FormattedText)[mark]) {
        Editor.removeMark(editor, mark);
      } else {
        Editor.addMark(editor, mark, value);
      }
      const { selection } = editor;
      if (selection && !Range.isCollapsed(selection)) {
        const toolbar =
          typeof ctx.payload === "object" &&
          ctx.payload !== null &&
          "source" in ctx.payload &&
          ctx.payload.source === "toolbar";
        if (toolbar) ReactEditor.focus(editor);
        Transforms.collapse(editor, { edge: "end" });
        if (!toolbar) Editor.removeMark(editor, mark);
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
  // 高亮写颜色值而非 true：Markdown 的 `:highlight[]` 指令需要颜色
  markCommand("highlight", "tau.mark.highlight", "高亮", "yellow"),
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

const CLEARABLE_MARKS = [
  "bold",
  "italic",
  "underline",
  "highlight",
  "code",
  "strikethrough",
  "color",
];

export const quitFormattedMarksCommands: EditorCommand[] = [
  {
    id: "tau.edit.clear-marks",
    title: "清除文本标记",
    when: editor => !ReactEditor.isReadOnly(editor),
    run: (editor: Editor, ctx: EditorCommandContext) => {
      const { selection } = editor;
      if (!selection || !Range.isCollapsed(selection)) return;
      // 只在光标处确有标记时消费 Esc；没有可清的标记就放行，交给宿主（关浮层、退出沉浸等）
      const marks = (Editor.marks(editor) ?? {}) as Record<string, unknown>;
      const active = CLEARABLE_MARKS.filter(type => marks[type]);
      if (active.length === 0) return;
      active.forEach(type => Editor.removeMark(editor, type));
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
    },
  },
];

export const quitFormattedMarksHotkeys: EditorHotkey[] = [
  { key: "escape", command: "tau.edit.clear-marks" },
];
