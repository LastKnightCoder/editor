import { ChevronDown, ChevronUp } from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";

import type { EditorCommand } from "../../../api/command";
import type { EditorMenuEntry } from "../../../api/menu";
import type { DetailElement } from "../../../types";

/** 详情块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const detailCommands: EditorCommand[] = [
  {
    id: "tau.detail.toggle",
    title: "收起/展开",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "detail") return;
      const path = ReactEditor.findPath(editor, ctx.element);
      Transforms.setNodes(editor, { open: !(ctx.element as DetailElement).open }, { at: path });
    },
  },
];

export const detailMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.detail.toggle",
    title: ctx => ((ctx.element as DetailElement).open ? "收起" : "展开"),
    icon: ctx =>
      (ctx.element as DetailElement).open ? <ChevronUp size={16} /> : <ChevronDown size={16} />,
    command: "tau.detail.toggle",
  },
];
