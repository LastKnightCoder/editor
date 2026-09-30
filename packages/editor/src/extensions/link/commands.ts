import type { EditorCommand, EditorHotkey } from "../../api";
import { wrapLink } from "../../utils";

/** mod+l：把选区包成链接（弹出输入） */
export const linkCommands: EditorCommand[] = [
  {
    id: "tau.link.wrap",
    title: "插入链接",
    run: (editor, ctx) => {
      wrapLink(editor, "", true);
      ctx.event?.preventDefault();
    },
  },
];

export const linkHotkeys: EditorHotkey[] = [{ key: "mod+l", command: "tau.link.wrap" }];
