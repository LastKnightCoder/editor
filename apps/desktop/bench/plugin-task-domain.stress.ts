import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../src-electron/main/modules/video-note-index-queue");
import schema from "@tau/db-schema/schema/main.sql?raw";
import ContentTable from "../src-electron/main/modules/tables/content";
import TodoGroupTable from "../src-electron/main/modules/tables/todo-group";
import {
  TaskAssistantEngine,
  readTask,
  type TaskInput,
} from "../src-electron/main/modules/task-assistant/engine";
import {
  readTaskInstance,
  queryOccurrenceStates,
} from "../src-electron/main/modules/task-assistant/occurrences";
import type { AssistantTask, TaskWriteName } from "@tau/shared/task-assistant";

it("交错规则、实例、旧版本、故障与时钟回拨后，持久状态和独立操作模型一致", () => {
  const directory = mkdtempSync(join(tmpdir(), "tau-task-domain-stress-"));
  const db = new Database(join(directory, "domain.db"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T12:00:00+08:00"));
  let request = 0;
  const engine = new TaskAssistantEngine(db);
  const run = (name: TaskWriteName, input: Omit<TaskInput, "requestId">) =>
    engine.execute(name, { ...input, requestId: `stress-${++request}` }, "stress", "plugin:stress");
  const succeeded = (name: TaskWriteName, input: Omit<TaskInput, "requestId">) => {
    const result = run(name, input);
    expect(result, JSON.stringify(result.error)).toMatchObject({ status: "succeeded" });
    return result.result as AssistantTask;
  };
  const states = new Map<
    string,
    { completed: boolean; skipped: boolean; scheduledAt: string | null }
  >();
  const roots: AssistantTask[] = [];
  let staleRejected = 0,
    failuresRolledBack = 0,
    random = 48271;
  const next = () => (random = (random * 48271) % 2147483647);
  try {
    db.exec(schema);
    db.pragma("journal_mode=WAL");
    db.pragma("foreign_keys=ON");
    const groupId = TodoGroupTable.createGroup(db, { title: "压力验证" })!.id;
    for (let index = 0; index < 12; index++) {
      const recurrence = { type: "daily" as const, interval: 1, startDate: "2026-10-01" };
      if (index % 2 === 0)
        roots.push(succeeded("create_todo", { title: `独立${index}`, groupId, recurrence }));
      else {
        const taskId = index === 1 ? "task@2026-11-25" : "task";
        const contentId = ContentTable.createContent(db, {
          content: [
            {
              type: "check-list",
              children: [
                {
                  type: "check-list-item",
                  taskId,
                  checked: false,
                  children: [
                    { type: "paragraph", children: [{ type: "formatted", text: `正文${index}` }] },
                  ],
                },
              ],
            },
          ],
        });
        const content = ContentTable.getContentById(db, contentId)!;
        db.prepare(
          "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,?,?)"
        ).run(contentId, content.createTime, content.createTime);
        const taskRef = {
          kind: "document" as const,
          contentId,
          createdAt: content.createTime,
          taskId,
        };
        roots.push(
          succeeded("set_todo_recurrence", {
            taskRef,
            revision: readTask(db, taskRef).revision,
            effectiveDate: "2026-10-01",
            rule: recurrence,
          })
        );
      }
    }
    for (let step = 0; step < 1800; step++) {
      const index = next() % roots.length;
      const root = roots[index];
      const day = `2026-${step % 2 ? "10" : "11"}-${String((next() % 28) + 1).padStart(2, "0")}`;
      const key = `${index}/${day}`;
      const before = states.get(key) ?? { completed: false, skipped: false, scheduledAt: null };
      const expected = { ...before };
      const patch: import("@tau/shared/task-assistant").TaskOccurrencePatch = {};
      const action = next() % 4;
      if (action === 0 || step % 17 === 0) {
        patch.completed = !before.completed;
        expected.completed = patch.completed;
        if (patch.completed) expected.skipped = false;
      } else if (action === 1) {
        patch.skipped = !before.skipped;
        expected.skipped = patch.skipped;
        if (patch.skipped) expected.completed = false;
      } else {
        patch.scheduledAt = action === 2 ? "2026-12-25" : null;
        expected.scheduledAt = patch.scheduledAt;
      }
      vi.setSystemTime(new Date(Date.now() + (step % 29 === 0 ? -30000 : 1)));
      const target = readTaskInstance(db, root.taskRef, day);
      if (step % 101 === 0 && root.taskRef.kind === "todo") {
        db.exec(
          `CREATE TEMP TRIGGER fail_state BEFORE INSERT ON todo_occurrence_override BEGIN SELECT RAISE(ABORT,'injected transaction failure'); END;`
        );
        const failed = run("update_todo_occurrence", {
          taskRef: root.taskRef,
          revision: target.revision,
          occurrence: target.occurrence,
          action: "patch",
          statePatch: patch,
        });
        expect(failed.status).toBe("failed");
        db.exec("DROP TRIGGER fail_state");
        expect(readTaskInstance(db, root.taskRef, day).revision).toBe(target.revision);
        failuresRolledBack++;
      }
      succeeded("update_todo_occurrence", {
        taskRef: root.taskRef,
        revision: target.revision,
        occurrence: target.occurrence,
        action: "patch",
        statePatch: patch,
      });
      states.set(key, expected);
      const actual = readTaskInstance(db, root.taskRef, day);
      expect({
        completed: actual.completed,
        skipped: !!actual.occurrenceState.skipped,
        scheduledAt: actual.occurrenceState.scheduledAt ?? null,
      }).toEqual(expected);
      expect(actual.occurrence).toEqual(target.occurrence);
      if (step % 17 === 0) {
        const stale = run("update_todo_occurrence", {
          taskRef: root.taskRef,
          revision: target.revision,
          occurrence: target.occurrence,
          action: "patch",
          statePatch: { completed: before.completed },
        });
        expect(stale).toMatchObject({ status: "failed", error: { code: "VERSION_CONFLICT" } });
        expect(readTaskInstance(db, root.taskRef, day).revision).toBe(actual.revision);
        staleRejected++;
      }
    }
    for (const [index, original] of roots.entries()) {
      const root = readTask(db, original.taskRef);
      succeeded("set_todo_recurrence", {
        taskRef: root.taskRef,
        revision: root.revision,
        effectiveDate: "2026-12-01",
        rule: null,
      });
      expect(() => readTaskInstance(db, root.taskRef, "2026-12-02")).toThrow();
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = queryOccurrenceStates(db, root.taskRef, 7, cursor);
        for (const item of page.items) {
          const key = `${index}/${item.originalDate}`;
          expect({
            completed: item.state.completedAt != null,
            skipped: !!item.state.skipped,
            scheduledAt: item.state.scheduledAt ?? null,
          }).toEqual(states.get(key));
          expect(item.active).toBe(true);
          seen.add(key);
        }
        cursor = page.cursor;
      } while (cursor);
      expect([...seen].sort()).toEqual(
        [...states.keys()].filter(key => key.startsWith(`${index}/`)).sort()
      );
    }
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(db.pragma("foreign_key_check")).toEqual([]);
    console.info(
      JSON.stringify({
        operations: 1800,
        roots: roots.length,
        persistedInstances: states.size,
        staleRejected,
        failuresRolledBack,
        integrity: "ok",
      })
    );
  } finally {
    db.close();
    vi.useRealTimers();
    rmSync(directory, { recursive: true, force: true });
  }
});
