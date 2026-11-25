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

import PluginCreateReceiptTable from "../tables/plugin-create-receipts";

export function replayPluginCreate(
  db: Database.Database,
  pluginId: string,
  requestId: string,
  hash: string
): TaskOperationResult | null {
  const receipt = PluginCreateReceiptTable.read(db, pluginId, requestId);
  if (!receipt) return null;
  if (receipt.input_hash !== hash || !["todo", "event"].includes(receipt.entity))
    fail("IDEMPOTENCY_CONFLICT", "同一创建请求 ID 不能更换参数或类型");
  if (!PluginCreateReceiptTable.exists(db, receipt))
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
  PluginCreateReceiptTable.save(db, pluginId, requestId, {
    input_hash: hash,
    entity: entity as "todo" | "event",
    entity_id: id,
    created_at: createdAt,
    operation_id: operationId,
  });
}
