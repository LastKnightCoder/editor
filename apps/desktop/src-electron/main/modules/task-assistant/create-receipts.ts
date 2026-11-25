import type Database from "better-sqlite3";
import type {
  AssistantTask,
  AssistantCalendarEvent,
  TaskOperationResult,
  TaskRef,
} from "@tau/shared/task-assistant";
import { fail } from "./common";
import { readIndependentTask } from "./independent";
import { readCalendarEvent } from "./calendar";

interface Receipt {
  input_hash: string;
  entity: string;
  entity_id: number;
  created_at: number;
  operation_id: string;
  retired: number;
}

export function replayPluginCreate(
  db: Database.Database,
  pluginId: string,
  requestId: string,
  hash: string
): TaskOperationResult | null {
  const receipt = db
    .prepare("SELECT * FROM plugin_create_receipts WHERE plugin_id=? AND request_id=?")
    .get(pluginId, requestId) as Receipt | undefined;
  if (!receipt) return null;
  if (receipt.input_hash !== hash) fail("IDEMPOTENCY_CONFLICT", "同一创建请求 ID 不能更换参数");
  const table = receipt.entity === "todo" ? "todo_item" : "calendar_event";
  const exists = db
    .prepare(`SELECT 1 FROM ${table} WHERE id=? AND create_time=?`)
    .get(receipt.entity_id, receipt.created_at);
  if (receipt.retired || !exists)
    fail("REQUEST_TARGET_GONE", "原创建结果已删除或撤销，请使用新的创建请求 ID");
  const result =
    receipt.entity === "todo"
      ? readIndependentTask(db, {
          kind: "todo",
          todoId: receipt.entity_id,
          createdAt: receipt.created_at,
        })
      : readCalendarEvent(db, receipt.entity_id);
  return { requestId, operationId: receipt.operation_id, status: "succeeded", result };
}

export function savePluginCreate(
  db: Database.Database,
  pluginId: string,
  requestId: string,
  hash: string,
  operationId: string,
  result: unknown
): void {
  const created = result as AssistantTask | AssistantCalendarEvent;
  let entity: string;
  let id: number;
  let createdAt: number;
  if ("taskRef" in created && !("eventId" in created)) {
    const ref: TaskRef = created.taskRef;
    if (ref.kind !== "todo") return;
    entity = "todo";
    id = ref.todoId;
    createdAt = ref.createdAt;
  } else if ("eventId" in created) {
    entity = "event";
    id = created.eventId;
    createdAt = created.createdAt;
  } else return;
  db.prepare(
    "INSERT INTO plugin_create_receipts(plugin_id,request_id,input_hash,entity,entity_id,created_at,operation_id) VALUES(?,?,?,?,?,?,?)"
  ).run(pluginId, requestId, hash, entity, id, createdAt, operationId);
}
