import { type EditorCommand, type EditorHotkey } from "@tau/editor/api";
import { insertAnnotation } from "./operations.ts";

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
