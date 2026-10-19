import { Circle, Palette } from "lucide-react";
import { Transforms } from "slate";
import { getCommandElementPath } from "@tau/editor/api";

import type { EditorCommand } from "@tau/editor/api";
import type { EditorMenuEntry } from "@tau/editor/api";
import type { Color, HighlightBlockElement } from "../types";

/** 高亮块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const highlightBlockCommands: EditorCommand[] = [
  {
    id: "tau.highlight-block.set-color",
    title: "修改高亮颜色",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "highlight-block") return;
      const color = (ctx.payload as { color?: Color })?.color;
      if (!COLORS.some(item => item.value === color)) return;
      const path = getCommandElementPath(editor, ctx);
      if (!path) return;
      Transforms.setNodes(editor, { color }, { at: path });
    },
  },
];

const COLORS: { value: Color; label: string; hex: string }[] = [
  { value: "red", label: "红色", hex: "#ef4444" },
  { value: "orange", label: "橙色", hex: "#f97316" },
  { value: "yellow", label: "黄色", hex: "#eab308" },
  { value: "green", label: "绿色", hex: "#22c55e" },
  { value: "blue", label: "蓝色", hex: "#3b82f6" },
  { value: "purple", label: "紫色", hex: "#a855f7" },
];

export const highlightBlockMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.highlight-block.set-color",
    title: "修改颜色",
    icon: <Palette size={16} />,
    children: COLORS.map(color => ({
      id: `tau.highlight-block.set-color-${color.value}`,
      title: color.label,
      icon: <Circle size={16} style={{ fill: color.hex, color: color.hex }} />,
      command: "tau.highlight-block.set-color",
      payload: { color: color.value },
      disabled: ctx => (ctx.element as HighlightBlockElement).color === color.value,
    })),
  },
];
