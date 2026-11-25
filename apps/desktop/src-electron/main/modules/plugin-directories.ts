import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  readDirectoryFields,
  type TodoListInput,
  type CalendarDirectoryInput,
} from "@tau/shared/task-assistant";
import type { DirectoryWrite } from "@tau/plugins/host";
import TodoGroupTable from "./tables/todo-group";
import CalendarTable from "./tables/calendar";
import PluginCreateReceiptTable from "./tables/plugin-create-receipts";
import { readDirectory } from "./task-assistant/catalog";
import { revision } from "./task-assistant/common";

function requireDirectory(db: Database.Database, entity: "todo-list" | "calendar", id: number) {
  const item = readDirectory(db, entity, id);
  if (!item) throw new Error("目录不存在");
  return item;
}

export function writePluginDirectory(db: Database.Database, plugin: string, write: DirectoryWrite) {
  if (
    !plugin ||
    !["todo-list", "calendar"].includes(write.entity) ||
    !["create", "update"].includes(write.action)
  )
    throw new Error("目录操作无效");
  const creating = write.action === "create";
  const fields = readDirectoryFields(write.entity, creating ? write.input : write.patch, creating);
  if (
    creating &&
    write.requestId !== undefined &&
    (typeof write.requestId !== "string" || !write.requestId.trim() || write.requestId.length > 128)
  )
    throw new Error("创建请求 ID 无效");
  return db
    .transaction(() => {
      if (write.action === "create") {
        const hash = write.requestHash ?? revision([write.entity, fields]);
        const receipt = write.requestId
          ? PluginCreateReceiptTable.read(db, plugin, write.requestId)
          : undefined;
        if (receipt) {
          if (receipt.entity !== write.entity || receipt.input_hash !== hash)
            throw new Error("同一创建请求 ID 不能更换参数或类型");
          if (!PluginCreateReceiptTable.exists(db, receipt))
            throw new Error("原创建结果已删除或撤销，请使用新的创建请求 ID");
          return requireDirectory(db, write.entity, receipt.entity_id);
        }
        let id: number;
        if (write.entity === "todo-list") {
          const created = TodoGroupTable.createGroup(db, {
            ...(fields as TodoListInput),
            color: fields.color ?? undefined,
          });
          if (!created) throw new Error("目录创建未能保存");
          id = created.id;
        } else id = CalendarTable.createDirectory(db, fields as CalendarDirectoryInput);
        const raw =
          write.entity === "todo-list"
            ? TodoGroupTable.getDirectoryItem(db, id)
            : CalendarTable.getDirectoryItem(db, id);
        if (!raw) throw new Error("目录创建未能保存");
        if (write.requestId)
          PluginCreateReceiptTable.save(db, plugin, write.requestId, {
            input_hash: hash,
            entity: write.entity,
            entity_id: id,
            created_at: raw.createTime,
            operation_id: randomUUID(),
          });
        return requireDirectory(db, write.entity, id);
      }
      const id = Number(write.id);
      if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== write.id)
        throw new Error("目录身份无效");
      const current = requireDirectory(db, write.entity, id);
      if (current.revision !== write.expectedRevision)
        throw new Error("PLUGIN_CONFLICT:目录已变化，请重新读取");
      if (!current.editable) throw new Error("系统目录不可编辑");
      if (
        Object.entries(fields).every(
          ([key, value]) => current[key as keyof typeof current] === value
        )
      )
        return current;
      if (write.entity === "todo-list") TodoGroupTable.patchDirectory(db, id, fields);
      else
        CalendarTable.patchDirectory(
          db,
          id,
          fields as import("@tau/shared/task-assistant").CalendarDirectoryPatch
        );
      return requireDirectory(db, write.entity, id);
    })
    .immediate();
}
