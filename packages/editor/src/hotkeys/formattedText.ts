import { getCurrentTextNode } from "../utils";
import { Editor, Range, Transforms } from "slate";
import { FormattedText, Mark } from "../types";
import type { EditorCommand, EditorCommandContext, EditorHotkey } from "../api/command";

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

export const quitFormattedMarksCommands: EditorCommand[] = [
  {
    id: "tau.edit.clear-marks",
    title: "清除文本标记",
    run: (editor: Editor, ctx: EditorCommandContext) => {
      const { selection } = editor;
      if (!selection || !Range.isCollapsed(selection)) return;
      const [match] = Editor.nodes(editor, {
        match: n => n.type === "formatted",
      });
      if (!match) return;
      ["bold", "italic", "underline", "highlight", "code", "strikethrough", "color"].forEach(
        type => {
          Editor.removeMark(editor, type);
          // 阻止默认行为
          ctx.event?.preventDefault();
          ctx.event?.stopPropagation();
        }
      );
    },
  },
];

export const quitFormattedMarksHotkeys: EditorHotkey[] = [
  { key: "escape", command: "tau.edit.clear-marks" },
];

// mod+左右在编辑器内只做兜底拦截（防止宿主的卡片收起/展开等默认行为）；表格与多列的
// 插列命令在扩展命令段、先于本命令匹配，命中场景不受影响
export const modMoveCommands: EditorCommand[] = [
  {
    id: "tau.edit.intercept-mod-right",
    title: "拦截向右默认行为",
    run: (_editor: Editor, ctx) => {
      ctx.event?.preventDefault();
    },
  },
  {
    id: "tau.edit.intercept-mod-left",
    title: "拦截向左默认行为",
    run: (_editor: Editor, ctx) => {
      ctx.event?.preventDefault();
    },
  },
];

export const modMoveHotkeys: EditorHotkey[] = [
  { key: "mod+right", command: "tau.edit.intercept-mod-right" },
  { key: "mod+left", command: "tau.edit.intercept-mod-left" },
];
