import React from "react";
import { Menu } from "@tau/ui";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eraser,
  Trash2,
} from "lucide-react";

import type { TableAlign } from "../../types";

export type HandleKind = "row" | "col";

export interface HandleMenuActions {
  insertBefore: () => void;
  insertAfter: () => void;
  setAlign: (align: TableAlign) => void;
  clear: () => void;
  remove: () => void;
}

interface HandleMenuItemsProps {
  kind: HandleKind;
  from: number;
  to: number;
  /** 所选列的共同对齐；不一致时为 undefined（仅列菜单） */
  align?: TableAlign;
  actions: HandleMenuActions;
}

const ICON = 15;

const title = (kind: HandleKind, from: number, to: number) => {
  const count = to - from + 1;
  if (kind === "col") return count > 1 ? `已选 ${count} 列` : `第 ${from + 1} 列`;
  if (count > 1) return `已选 ${count} 行`;
  return from === 0 ? "表头行" : `第 ${from} 行`;
};

/** 行 / 列手柄菜单：作用于手柄所选的整行 / 整列（可多选） */
export default function HandleMenuItems({ kind, from, to, align, actions }: HandleMenuItemsProps) {
  const count = to - from + 1;
  const isCol = kind === "col";
  return (
    <React.Fragment>
      <Menu.Group>{title(kind, from, to)}</Menu.Group>
      <Menu.Item
        icon={isCol ? <ArrowLeft size={ICON} /> : <ArrowUp size={ICON} />}
        onSelect={actions.insertBefore}
      >
        {isCol ? "在左侧插入列" : "在上方插入行"}
      </Menu.Item>
      <Menu.Item
        icon={isCol ? <ArrowRight size={ICON} /> : <ArrowDown size={ICON} />}
        onSelect={actions.insertAfter}
      >
        {isCol ? "在右侧插入列" : "在下方插入行"}
      </Menu.Item>
      {isCol && (
        <React.Fragment>
          <Menu.Separator />
          <Menu.RadioGroup
            value={align === undefined ? undefined : (align ?? "left")}
            onValueChange={value => actions.setAlign(value as TableAlign)}
          >
            <Menu.RadioItem value="left" icon={<AlignLeft size={ICON} />}>
              左对齐
            </Menu.RadioItem>
            <Menu.RadioItem value="center" icon={<AlignCenter size={ICON} />}>
              居中
            </Menu.RadioItem>
            <Menu.RadioItem value="right" icon={<AlignRight size={ICON} />}>
              右对齐
            </Menu.RadioItem>
          </Menu.RadioGroup>
        </React.Fragment>
      )}
      <Menu.Separator />
      <Menu.Item icon={<Eraser size={ICON} />} onSelect={actions.clear}>
        清空内容
      </Menu.Item>
      <Menu.Item icon={<Trash2 size={ICON} />} kbd="⌫" danger onSelect={actions.remove}>
        {count > 1 ? `删除 ${count} ${isCol ? "列" : "行"}` : isCol ? "删除列" : "删除行"}
      </Menu.Item>
    </React.Fragment>
  );
}
