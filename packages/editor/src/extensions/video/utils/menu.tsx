import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";

import type { EditorCommand } from "../../../api/command";
import type { EditorMenuEntry, EditorMenuContext } from "../../../api/menu";
import type { VideoElement } from "../../../types";

/** 视频块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const videoCommands: EditorCommand[] = [
  {
    id: "tau.video.set-align",
    title: "设置对齐方式",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "video") return;
      const align = (ctx.payload as { align?: VideoElement["align"] })?.align;
      if (!align) return;
      const path = ReactEditor.findPath(editor, ctx.element);
      Transforms.setNodes(editor, { align }, { at: path });
    },
  },
];

const alignIcon = (ctx: EditorMenuContext) => {
  const align = (ctx.element as VideoElement).align || "center";
  return align === "left" ? (
    <AlignLeft size={16} />
  ) : align === "right" ? (
    <AlignRight size={16} />
  ) : (
    <AlignCenter size={16} />
  );
};

const ALIGNMENTS = [
  { align: "left", label: "左对齐" },
  { align: "center", label: "居中" },
  { align: "right", label: "右对齐" },
] as const;

export const videoMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.video.align",
    title: "对齐方式",
    icon: alignIcon,
    children: ALIGNMENTS.map(({ align, label }) => ({
      id: `tau.video.align-${align}`,
      title: label,
      icon:
        align === "left" ? (
          <AlignLeft size={16} />
        ) : align === "right" ? (
          <AlignRight size={16} />
        ) : (
          <AlignCenter size={16} />
        ),
      command: "tau.video.set-align",
      payload: { align },
      disabled: ctx => ((ctx.element as VideoElement).align || "center") === align,
    })),
  },
];
