import type Database from "better-sqlite3";
import type { TaskRef } from "@tau/shared/task-assistant";
import { resolveDocTaskSources } from "../doc-tasks/sources";
import { fail } from "./common";

export function assertPluginTaskVisible(db: Database.Database, ref: TaskRef) {
  if (ref.kind !== "document") return;
  if (
    !resolveDocTaskSources(db, [ref.contentId]).has(ref.contentId) ||
    db
      .prepare(
        "SELECT 1 FROM doc_task_settings WHERE content_id=? AND (kind='excluded' OR (kind='promoted' AND task_id=?))"
      )
      .get(ref.contentId, ref.taskId)
  )
    fail("NOT_FOUND", "正文待办已不在可用来源中");
}
