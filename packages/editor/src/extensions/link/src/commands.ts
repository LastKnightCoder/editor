import { type EditorCommand, type EditorHotkey } from "@tau/editor/api";
import { ReactEditor } from "slate-react";
import { openLinkPanel } from "./panel/controller.ts";

/** mod+l：选区在链接里时编辑，否则在选区或光标处新建 */
export const linkCommands: EditorCommand[] = [
  {
    id: "tau.link.wrap",
    title: "插入链接",
    when: editor => !ReactEditor.isReadOnly(editor),
    run: (editor, ctx) => {
      openLinkPanel(editor);
      ctx.event?.preventDefault();
    },
  },
];

export const linkHotkeys: EditorHotkey[] = [{ key: "mod+l", command: "tau.link.wrap" }];
