import type { EditorCommand, EditorHotkey } from "../api/command";
import type { Editor } from "slate";

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
