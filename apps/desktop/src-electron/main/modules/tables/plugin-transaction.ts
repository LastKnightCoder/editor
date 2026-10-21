import Database from "better-sqlite3";
import { basename } from "node:path";
import type { PluginEntityScope } from "@/types/plugin-entities";
import type { PluginTransactionCommitOp } from "@/types/plugin-transaction";
import { asynchronousDatabaseCommand } from "../database-command";
import { writeAsPlugin } from "../domain-event-origin";
import PluginEntityTable from "./plugin-entity";
import PluginLinkTable from "./plugin-links";
import PluginRecordTable from "./plugin-records";

const MAX_OPS = 500;

/**
 * 插件原子提交：一批对本插件实体、记录与关联的写入在一个数据库事务里按顺序执行，
 * 任何一条失败全部回滚。初始正文的 Markdown 转换是异步的，先在事务外全部解析好。
 */
export default class PluginTransactionTable {
  static getListenEvents() {
    return {
      "plugin-transaction:commit": asynchronousDatabaseCommand(this.commit.bind(this)),
    };
  }

  private static assertDatabase(db: Database.Database, databaseName: string) {
    if (basename(db.name).replace(/\.db$/, "") !== databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
  }

  static async commit(
    db: Database.Database,
    request: PluginEntityScope & { ops: PluginTransactionCommitOp[] }
  ): Promise<void> {
    this.assertDatabase(db, request.databaseName);
    if (typeof request.pluginId !== "string" || !request.pluginId) throw new Error("插件 ID 无效");
    const { ops } = request;
    if (!Array.isArray(ops) || !ops.length || ops.length > MAX_OPS)
      throw new Error(`一个事务需要 1–${MAX_OPS} 条写入`);
    const creates = ops.filter(op => op.op === "entity.create");
    for (const op of creates) PluginEntityTable.consumeReservation(db, request.pluginId, op.id);
    const contents = new Map(
      await Promise.all(
        creates.map(
          async op => [op.id, await PluginEntityTable.resolveContent(db, op.input)] as const
        )
      )
    );
    // 正文转换期间可能已切库或关库
    this.assertDatabase(db, request.databaseName);
    if (!db.open) throw new Error("数据库连接已失效");
    const scope = { databaseName: request.databaseName, pluginId: request.pluginId };
    writeAsPlugin(request.pluginId, () =>
      db.transaction(() => {
        for (const op of ops) this.apply(db, scope, op, contents);
      })()
    );
  }

  private static apply(
    db: Database.Database,
    scope: PluginEntityScope,
    op: PluginTransactionCommitOp,
    contents: Map<number, Awaited<ReturnType<typeof PluginEntityTable.resolveContent>>>
  ) {
    switch (op.op) {
      case "entity.create":
        PluginEntityTable.insertResolved(db, scope.pluginId, op.input, contents.get(op.id)!, op.id);
        return;
      case "entity.update":
        PluginEntityTable.update(db, {
          ...scope,
          id: op.id,
          patch: op.patch,
          expectedRevision: op.expectedRevision,
          indexes: op.indexes,
        });
        return;
      case "entity.delete":
        PluginEntityTable.remove(db, {
          ...scope,
          id: op.id,
          expectedRevision: op.expectedRevision,
        });
        return;
      case "record.insert":
        PluginRecordTable.insert(db, { ...scope, ...op });
        return;
      case "record.update":
        PluginRecordTable.update(db, { ...scope, ...op });
        return;
      case "record.delete":
        PluginRecordTable.remove(db, { ...scope, ...op });
        return;
      // 已关联过的 add 返回已有的那条，相当于什么也不做
      case "link.add":
        PluginLinkTable.add(db, { ...scope, ...op });
        return;
      case "link.remove":
        PluginLinkTable.remove(db, { ...scope, id: op.id });
        return;
      case "link.reorder":
        PluginLinkTable.reorder(db, { ...scope, from: op.from, ids: op.ids });
        return;
      default:
        throw new Error("未知的写入");
    }
  }
}
