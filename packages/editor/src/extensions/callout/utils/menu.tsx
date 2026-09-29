import { AlertCircle, AlertTriangle, FileText, Info, Lightbulb, Palette } from "lucide-react";
import type { ReactElement } from "react";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";

import type { EditorCommand } from "../../../api/command";
import type { EditorMenuEntry } from "../../../api/menu";
import type { CalloutElement, CalloutType } from "../../../types";

const CALLOUT_TYPES: { value: CalloutType; label: string; icon: ReactElement }[] = [
  { value: "info", label: "信息", icon: <Info size={16} /> },
  { value: "tip", label: "提示", icon: <Lightbulb size={16} /> },
  { value: "warning", label: "警告", icon: <AlertTriangle size={16} /> },
  { value: "danger", label: "危险", icon: <AlertCircle size={16} /> },
  { value: "note", label: "备注", icon: <FileText size={16} /> },
];

/** Callout 块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const calloutCommands: EditorCommand[] = [
  {
    id: "tau.callout.set-type",
    title: "修改标注类型",
    run: (editor, ctx) => {
      if (ctx.element?.type !== "callout") return;
      const calloutType = (ctx.payload as { calloutType?: CalloutType })?.calloutType;
      if (!calloutType) return;
      const path = ReactEditor.findPath(editor, ctx.element);
      Transforms.setNodes(editor, { calloutType }, { at: path });
    },
  },
];

export const calloutMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.callout.set-type",
    title: "修改类型",
    icon: <Palette size={16} />,
    children: CALLOUT_TYPES.map(type => ({
      id: `tau.callout.set-type-${type.value}`,
      title: type.label,
      icon: type.icon,
      command: "tau.callout.set-type",
      payload: { calloutType: type.value },
      disabled: ctx => (ctx.element as CalloutElement).calloutType === type.value,
    })),
  },
];
