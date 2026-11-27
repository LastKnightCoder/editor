import React from "react";
import { Menu, toast } from "@tau/ui";
import type { CommandContext, DatabaseCommandApi, DatabaseCommandDefinition } from "../commands";
import { useDatabaseI18n, type DatabaseT } from "../i18n";

const messageOf = (t: DatabaseT, error: unknown, label: string) =>
  t("command.failed", {
    label,
    message: error instanceof Error ? error.message : String(error),
  });

function runCommand(t: DatabaseT, definition: DatabaseCommandDefinition, ctx: CommandContext) {
  try {
    Promise.resolve(definition.run(ctx)).catch(error =>
      toast.error(messageOf(t, error, definition.label))
    );
  } catch (error) {
    toast.error(messageOf(t, error, definition.label));
  }
}

/** 扩展命令的菜单项集合（已过滤）；run 抛错或 reject 时 toast 报错，不影响表格 */
const CommandMenuItems: React.FC<{
  items: readonly DatabaseCommandDefinition[];
  api: DatabaseCommandApi;
  rowId?: string;
  columnId?: string;
}> = ({ items, api, rowId, columnId }) => {
  const { t } = useDatabaseI18n();
  return (
    <>
      {items.map(item => (
        <Menu.Item
          key={item.id}
          danger={item.danger}
          onSelect={() => runCommand(t, item, { api, rowId, columnId })}
        >
          {item.label}
        </Menu.Item>
      ))}
    </>
  );
};

export default CommandMenuItems;
