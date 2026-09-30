import type { EditorCommand, EditorHotkey } from "../../api";
import { wrapComment } from "../../utils";

/** mod+shift+m：把选区包成批注 */
export const commentCommands: EditorCommand[] = [
  {
    id: "tau.comment.wrap",
    title: "插入批注",
    run: (editor, ctx) => {
      wrapComment(editor);
      ctx.event?.preventDefault();
    },
  },
];

export const commentHotkeys: EditorHotkey[] = [{ key: "mod+shift+m", command: "tau.comment.wrap" }];
