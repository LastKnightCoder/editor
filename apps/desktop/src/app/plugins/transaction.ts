import type { PluginContext } from "@tau/plugins";
import type { PluginTransactionOp, TransactionAdapter } from "@tau/plugins/host";
import { commitPluginTransaction, reservePluginEntityId } from "@/commands/plugin-transaction";
import { bindDatabaseCommands } from "@/services/command-context";
import type { PluginTransactionCommitOp } from "@/types/plugin-transaction";
import { mapConflict, toContentSource } from "./data";

const entityId = (id: string) => {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("内容不存在");
  return value;
};

/** 插件实体与关联来源的 ID 转成数字，正文输入解码引用 */
function toCommitOp(op: PluginTransactionOp): PluginTransactionCommitOp {
  switch (op.op) {
    case "entity.create": {
      const { content, ...input } = op.input;
      return {
        op: op.op,
        id: entityId(op.id),
        input: {
          ...input,
          indexes: op.indexes,
          ...(content ? { content: toContentSource(content) } : {}),
        },
      };
    }
    case "entity.update":
    case "entity.delete":
      return { ...op, id: entityId(op.id) };
    case "link.add":
    case "link.reorder":
      return { ...op, from: entityId(op.from) };
    default:
      return op;
  }
}

/** 原子提交：预留实体 ID 与一次性提交，命令固定到 Provider 创建宿主时的库并带实例 signal */
export function createDesktopTransaction(databaseName: string): TransactionAdapter {
  const bound = (context: PluginContext) =>
    bindDatabaseCommands(
      { reservePluginEntityId, commitPluginTransaction },
      { databaseName, signal: context.signal }
    );
  return {
    async reserveEntityId(context) {
      return String(await bound(context).reservePluginEntityId(databaseName, context.pluginId));
    },
    async commit(context, ops) {
      const converted = ops.map(toCommitOp);
      await mapConflict(() =>
        bound(context).commitPluginTransaction(databaseName, context.pluginId, converted)
      );
    },
  };
}
