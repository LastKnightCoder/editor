/**
 * 项目详情域的菜单项数据协议与渲染收口（替代 antd MenuProps["items"]）：
 * 菜单项按条目类型/环境条件数据驱动构造（保持纯函数可测），渲染统一经
 * renderMenuEntries 映射到 tau Menu 复合组件。
 */

import type { ReactNode } from "react";
import { Menu } from "@tau/ui";

export interface MenuEntry {
  key: string;
  /** 分隔线项（label 留空） */
  divider?: boolean;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children?: MenuEntry[];
}

export type MenuEntryList = MenuEntry[];

export function renderMenuEntries(
  entries: MenuEntryList,
  onSelect: (key: string) => void
): ReactNode {
  return entries.map(entry =>
    entry.divider ? (
      <Menu.Separator key={entry.key} />
    ) : entry.children?.length ? (
      <Menu.Submenu key={entry.key} label={entry.label} icon={entry.icon}>
        {renderMenuEntries(entry.children, onSelect)}
      </Menu.Submenu>
    ) : (
      <Menu.Item
        key={entry.key}
        icon={entry.icon}
        danger={entry.danger}
        disabled={entry.disabled}
        onSelect={() => onSelect(entry.key)}
      >
        {entry.label}
      </Menu.Item>
    )
  );
}
