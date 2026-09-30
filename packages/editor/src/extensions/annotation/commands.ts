import type { EditorCommand, EditorHotkey } from "../../api";
import { insertAnnotation } from "../../utils";

/** mod+shift+n：插入注解 */
export const annotationCommands: EditorCommand[] = [
  {
    id: "tau.annotation.insert",
    title: "插入注解",
    run: (editor, ctx) => {
      insertAnnotation(editor, "注解内容");
      ctx.event?.preventDefault();
    },
  },
];

export const annotationHotkeys: EditorHotkey[] = [
  { key: "mod+shift+n", command: "tau.annotation.insert" },
];
