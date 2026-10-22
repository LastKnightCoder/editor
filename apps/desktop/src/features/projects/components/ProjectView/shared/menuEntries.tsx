/**
 * 项目详情域的菜单项数据协议与渲染收口（替代 antd MenuProps["items"]）：
 * 菜单项按条目类型/环境条件数据驱动构造（保持纯函数可测），渲染统一经
 * renderMenuEntries 映射到 tau Menu 复合组件。
 */

import type { ReactNode } from "react";
import { Menu } from "@tau/ui";
import type { PluginActionTarget } from "@tau/plugins";
import { pluginActionIcon, usePluginActions } from "@/app/plugins/action-menu";

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

/** 插件对象动作在「⋯」菜单里的 key 前缀，其后为动作的 ID */
export const PLUGIN_ACTION_KEY_PREFIX = "plugin-action:";

/** 插件动作排在内置项之后、删除之前，自带一条分隔线 */
export function insertPluginActionEntries(
  entries: MenuEntryList,
  actions: readonly { id: string; label: string; icon?: ReactNode }[]
): MenuEntryList {
  if (!actions.length) return entries;
  const plugin: MenuEntryList = [
    { key: `${PLUGIN_ACTION_KEY_PREFIX}divider`, label: "", divider: true },
    ...actions.map(action => ({
      key: `${PLUGIN_ACTION_KEY_PREFIX}${action.id}`,
      label: action.label,
      icon: action.icon,
    })),
  ];
  const index = entries.findIndex(entry => entry.key === "remove-divider");
  return index < 0
    ? [...entries, ...plugin]
    : [...entries.slice(0, index), ...plugin, ...entries.slice(index)];
}

/** 数据驱动的菜单接插件对象动作：insert 加条目，select 处理插件条目（返回 true 表示已处理） */
export function usePluginMenuEntries(target: PluginActionTarget | null): {
  insert(entries: MenuEntryList): MenuEntryList;
  select(key: string): boolean;
} {
  const { actions, run } = usePluginActions(target);
  return {
    insert: entries =>
      insertPluginActionEntries(
        entries,
        actions.map(action => ({
          id: action.id,
          label: action.definition.title,
          icon: pluginActionIcon(action),
        }))
      ),
    select: key => {
      if (!key.startsWith(PLUGIN_ACTION_KEY_PREFIX)) return false;
      const action = actions.find(item => item.id === key.slice(PLUGIN_ACTION_KEY_PREFIX.length));
      if (action) run(action);
      return true;
    },
  };
}
