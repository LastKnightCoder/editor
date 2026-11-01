import { type EditorCommand } from "@tau/editor/api";
import { insertAnnotation } from "./operations.ts";

/** 插入注解；不绑热键（mod+shift+n 在桌面端是系统级速记快捷键），入口是插入菜单 */
export const annotationCommands: EditorCommand[] = [
  {
    id: "tau.annotation.insert",
    title: "插入注解",
    run: (editor, ctx) => {
      insertAnnotation(editor);
      ctx.event?.preventDefault();
    },
  },
];
