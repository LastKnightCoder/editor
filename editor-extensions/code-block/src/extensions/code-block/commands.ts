import { isCollapsed, type EditorCommand, type EditorHotkey } from "@tau/editor/api";
import { insertCodeBlock } from "../../insert";

/** mod+`：光标收起时插入 JavaScript 代码块 */
const insert: EditorCommand = {
  id: "tau.code-block.insert",
  title: "插入代码块",
  run: (editor, ctx) => {
    if (!isCollapsed(editor)) return;
    const language = (ctx.payload as { language?: string } | undefined)?.language;
    insertCodeBlock(editor, language ?? "javascript");
  },
};

export const codeBlockHotkeyCommands: EditorCommand[] = [insert];

export const codeBlockHotkeys: EditorHotkey[] = [
  { key: "mod+`", command: "tau.code-block.insert" },
];
