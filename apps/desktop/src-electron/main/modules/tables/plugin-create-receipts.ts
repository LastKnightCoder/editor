import type Database from "better-sqlite3";

export type CreateEntity = "todo" | "event" | "todo-list" | "calendar";
export interface CreateReceipt {
  input_hash: string;
  entity: CreateEntity;
  entity_id: number;
  created_at: number;
  operation_id: string;
  retired: number;
}
const tables: Record<CreateEntity, string> = {
  todo: "todo_item",
  event: "calendar_event",
  "todo-list": "todo_group",
  calendar: "calendar",
};
export default class PluginCreateReceiptTable {
  static read(db: Database.Database, plugin: string, key: string): CreateReceipt | undefined {
    return db
      .prepare("SELECT * FROM plugin_create_receipts WHERE plugin_id=? AND request_id=?")
      .get(plugin, key) as CreateReceipt | undefined;
  }
  static exists(db: Database.Database, receipt: CreateReceipt): boolean {
    return (
      !receipt.retired &&
      !!db
        .prepare(`SELECT 1 FROM ${tables[receipt.entity]} WHERE id=? AND create_time=?`)
        .get(receipt.entity_id, receipt.created_at)
    );
  }
  static save(
    db: Database.Database,
    plugin: string,
    key: string,
    receipt: Omit<CreateReceipt, "retired">
  ): void {
    db.prepare(
      "INSERT INTO plugin_create_receipts(plugin_id,request_id,input_hash,entity,entity_id,created_at,operation_id) VALUES(?,?,?,?,?,?,?)"
    ).run(
      plugin,
      key,
      receipt.input_hash,
      receipt.entity,
      receipt.entity_id,
      receipt.created_at,
      receipt.operation_id
    );
  }
}
