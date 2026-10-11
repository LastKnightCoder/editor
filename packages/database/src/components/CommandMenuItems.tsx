import React from "react";
import { Menu, toast } from "@tau/ui";
import type { CommandContext, DatabaseCommandApi, DatabaseCommandDefinition } from "../commands";

const messageOf = (error: unknown, label: string) =>
  `命令「${label}」执行失败：${error instanceof Error ? error.message : String(error)}`;

function runCommand(definition: DatabaseCommandDefinition, ctx: CommandContext) {
  try {
    Promise.resolve(definition.run(ctx)).catch(error =>
      toast.error(messageOf(error, definition.label))
    );
  } catch (error) {
    toast.error(messageOf(error, definition.label));
  }
}

/** 扩展命令的菜单项集合（已过滤）；run 抛错或 reject 时 toast 报错，不影响表格 */
const CommandMenuItems: React.FC<{
  items: readonly DatabaseCommandDefinition[];
  api: DatabaseCommandApi;
  rowId?: string;
  columnId?: string;
}> = ({ items, api, rowId, columnId }) => (
  <>
    {items.map(item => (
      <Menu.Item
        key={item.id}
        danger={item.danger}
        onSelect={() => runCommand(item, { api, rowId, columnId })}
      >
        {item.label}
      </Menu.Item>
    ))}
  </>
);

export default CommandMenuItems;
