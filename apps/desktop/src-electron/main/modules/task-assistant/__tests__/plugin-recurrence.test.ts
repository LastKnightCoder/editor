import TodoRecurrenceTable from "../../tables/todo-recurrence";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  patchOccurrenceState,
  taskKey,
  decodeTaskIdComponent,
  parseTaskKey,
  type TaskOccurrenceState,
  type TaskOccurrencePatch,
} from "@tau/shared/task-assistant";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron");
vi.mock("../../video-note-index-queue");
import { must } from "../../../test-support";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import { reindexDocTasks } from "../../doc-tasks/indexer";
import { assistantReminders } from "../reminders";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { TaskAssistantEngine, readTask, type TaskInput } from "../engine";
import { readTaskInstance, queryOccurrenceStates } from "../occurrences";
import type { AssistantTask, TaskWriteName, TaskRef } from "@tau/shared/task-assistant";
import TodoGroupTable from "../../tables/todo-group";
import ContentTable from "../../tables/content";

describe("插件重复与正文待办契约", () => {
  it("共享状态夹具锁定两端的完成、跳过、清除与互斥语义", () => {
    const cases = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../../../../../packages/shared/src/utils/__fixtures__/plugin-todo-states.json"
        ),
        "utf8"
      )
    ) as Array<{
      state: TaskOccurrenceState;
      patch: TaskOccurrencePatch;
      expected: Record<string, unknown>;
      reject?: boolean;
    }>;
    for (const item of cases) {
      if (item.reject) expect(() => patchOccurrenceState(item.state, item.patch, 100)).toThrow();
      else {
        const result: Record<string, unknown> = {
          ...patchOccurrenceState(item.state, item.patch, 100),
        };
        if (item.expected.completedAt === "now") {
          expect(result.completedAt).toBe(100);
          result.completedAt = "now";
        }
        expect(result).toEqual(item.expected);
      }
    }
  });

  let db: Database.Database, engine: TaskAssistantEngine, groupId: number, sequence: number;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00+08:00"));
    db = new Database(":memory:");
    db.exec(schema);
    groupId = TodoGroupTable.createGroup(db, { title: "工作" })!.id;
    engine = new TaskAssistantEngine(db);
    sequence = 0;
  });
  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });
  const write = (name: TaskWriteName, input: Omit<TaskInput, "requestId">) => {
    const result = engine.execute(
      name,
      { ...input, requestId: `operation-${++sequence}` },
      "b",
      "plugin:fixture"
    );
    expect(result, JSON.stringify(result.error)).toMatchObject({ status: "succeeded" });
    return result.result as AssistantTask;
  };
  const document = (): Extract<TaskRef, { kind: "document" }> => {
    const contentId = ContentTable.createContent(db, {
      content: [
        {
          type: "check-list",
          children: [
            {
              type: "check-list-item",
              taskId: "task",
              checked: false,
              children: [{ type: "paragraph", children: [{ type: "formatted", text: "原任务" }] }],
            },
          ],
        },
      ],
    });
    const content = ContentTable.getContentById(db, contentId)!;
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,?,?)"
    ).run(content.id, content.createTime, content.createTime);
    return {
      kind: "document",
      contentId: content.id,
      createdAt: content.createTime,
      taskId: "task",
    };
  };

  it("共享身份夹具编码后能还原原始任务，根身份不包含实例分隔符", () => {
    const ids = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../../../../../packages/shared/src/utils/__fixtures__/plugin-task-ids.json"
        ),
        "utf8"
      )
    ) as string[];
    for (const taskId of ids) {
      const key = taskKey({ kind: "document", contentId: 50, createdAt: 10, taskId });
      const component = key.startsWith("document:v2:")
        ? "~" + key.slice("document:v2:50:10:".length)
        : key.slice("document:50:10:".length);
      expect(component).not.toMatch(/[@\r\n\u2028\u2029]/);
      expect(decodeTaskIdComponent(component)).toBe(taskId);
      expect(parseTaskKey(key)).toEqual({
        taskRef: { kind: "document", contentId: 50, createdAt: 10, taskId },
      });
      expect(parseTaskKey(key + "@2026-11-25")).toEqual({
        taskRef: { kind: "document", contentId: 50, createdAt: 10, taskId },
        occurrenceDate: "2026-11-25",
      });
    }
  });
  it("历史实例按原始身份改期、跳过、完成和恢复，停止不清空历史", () => {
    let root = write("create_todo", {
      title: "系列",
      groupId,
      recurrence: { type: "daily", interval: 1, startDate: "2026-10-01" },
    });
    root = write("set_todo_recurrence", {
      taskRef: root.taskRef,
      revision: root.revision,
      effectiveDate: "2026-10-10",
      rule: { type: "weekly", interval: 1, weekdays: [1], startDate: "2026-10-10" },
    });
    const instance = readTaskInstance(db, root.taskRef, "2026-10-02");
    write("update_todo_occurrence", {
      taskRef: root.taskRef,
      revision: instance.revision,
      occurrence: instance.occurrence,
      action: "patch",
      statePatch: { skipped: true, scheduledAt: "2026-12-10" },
    });
    const moved = readTaskInstance(db, root.taskRef, "2026-10-02");
    expect(moved).toMatchObject({
      occurrence: instance.occurrence,
      dueAt: "2026-12-10",
      occurrenceState: { skipped: true },
    });
    const stale = engine.execute(
      "update_todo_occurrence",
      {
        requestId: "stale",
        taskRef: root.taskRef,
        revision: instance.revision,
        occurrence: instance.occurrence,
        action: "patch",
        statePatch: { completed: true },
      },
      "b"
    );
    expect(stale).toMatchObject({ status: "failed", error: { code: "VERSION_CONFLICT" } });
    write("update_todo_occurrence", {
      taskRef: root.taskRef,
      revision: moved.revision,
      occurrence: moved.occurrence,
      action: "patch",
      statePatch: { completed: true, scheduledAt: null },
    });
    expect(readTaskInstance(db, root.taskRef, "2026-10-02")).toMatchObject({
      dueAt: "2026-10-02",
      completed: true,
      occurrenceState: { skipped: false },
    });
    root = readTask(db, root.taskRef);
    write("set_todo_recurrence", {
      taskRef: root.taskRef,
      revision: root.revision,
      effectiveDate: "2026-11-01",
      rule: null,
    });
    expect(readTaskInstance(db, root.taskRef, "2026-10-02").completed).toBe(true);
    expect(() => readTaskInstance(db, root.taskRef, "2026-11-02")).toThrow();
    expect(queryOccurrenceStates(db, root.taskRef, 1).items).toMatchObject([
      {
        originalDate: "2026-10-02",
        seriesId: instance.occurrence.seriesId,
        active: true,
        state: { skipped: false, scheduledAt: null },
      },
    ]);
  });

  it("旧手机合成系列的实例状态在统一身份和分段停止后保留", () => {
    const root = write("create_todo", { title: "旧系列", groupId });
    if (root.taskRef.kind !== "todo") throw new Error("fixture");
    db.prepare("UPDATE todo_item SET type='recurring' WHERE id=?").run(root.taskRef.todoId);
    db.prepare(
      "INSERT INTO todo_recurrence(id,todo_item_id,type,interval,start_date,create_time,update_time) VALUES(77,?,'daily',1,?,1,1)"
    ).run(root.taskRef.todoId, new Date("2026-10-01T00:00:00").getTime());
    db.prepare(
      "INSERT INTO todo_occurrence_override VALUES(?,?,'native:77:1','2026-10-02',?,1)"
    ).run(
      root.taskRef.todoId,
      root.taskRef.createdAt,
      JSON.stringify({ completedAt: 123, skipped: false })
    );
    expect(readTaskInstance(db, root.taskRef, "2026-10-02")).toMatchObject({
      completed: true,
      occurrence: { seriesId: "recurrence:77:1" },
    });
    const current = readTask(db, root.taskRef);
    write("set_todo_recurrence", {
      taskRef: root.taskRef,
      revision: current.revision,
      effectiveDate: "2026-11-01",
      rule: null,
    });
    expect(queryOccurrenceStates(db, root.taskRef, 10).items).toMatchObject([
      {
        seriesId: "recurrence:77:1",
        originalDate: "2026-10-02",
        state: { completedAt: 123 },
        active: true,
      },
    ]);
  });
  it("未来系列保持现有待办读取入口可用，生效日期之前不生成实例", () => {
    const task = write("create_todo", {
      title: "未来规则",
      groupId,
      recurrence: { type: "daily", interval: 1, startDate: "2026-12-01" },
    });
    if (task.taskRef.kind !== "todo") throw new Error("fixture");
    const legacy = TodoRecurrenceTable.getRecurrenceByItemId(db, {
      todoItemId: task.taskRef.todoId,
    });
    expect(legacy?.segments).toMatchObject([{ effectiveDate: "2026-12-01" }]);
    expect(() => readTaskInstance(db, task.taskRef, "2026-11-26")).toThrow();
    expect(readTaskInstance(db, task.taskRef, "2026-12-01").occurrence.occurrenceDate).toBe(
      "2026-12-01"
    );
  });
  it("系统时钟回拨到零时仍保留实例完成状态", () => {
    const root = write("create_todo", {
      title: "时钟边界",
      groupId,
      recurrence: { type: "daily", interval: 1, startDate: "2026-10-01" },
    });
    const instance = readTaskInstance(db, root.taskRef, "2026-10-02");
    vi.setSystemTime(0);
    write("update_todo_occurrence", {
      taskRef: root.taskRef,
      revision: instance.revision,
      occurrence: instance.occurrence,
      action: "patch",
      statePatch: { completed: true },
    });
    expect(readTaskInstance(db, root.taskRef, "2026-10-02")).toMatchObject({
      completed: true,
      occurrenceState: { completedAt: 0 },
    });
  });
  it("回写父待办完成时刻时保留子项历史，校时不会重新完成已重开的子项", () => {
    const parent = write("create_todo", { title: "父项", groupId });
    const child = write("create_todo", { title: "子项", groupId, parentRef: parent.taskRef });
    const complete = (ref: TaskRef, completed: boolean, completedAt?: number) =>
      write("set_todo_completed", {
        taskRef: ref,
        revision: readTask(db, ref).revision,
        completed,
        ...(completedAt === undefined ? {} : { completedAt }),
      });
    expect(parent.completedAt).toBeNull();
    complete(child.taskRef, true, 0);
    expect(complete(parent.taskRef, true, 1000).completedAt).toBe(1000);
    expect(readTask(db, child.taskRef).completedAt).toBe(0);
    expect(complete(parent.taskRef, true).completedAt).toBe(1000);
    complete(child.taskRef, false);
    const reopened = readTask(db, child.taskRef);
    expect(reopened.completedAt).toBeNull();
    const previous = readTask(db, parent.taskRef);
    const checkpoint = db.prepare("SELECT MAX(seq) FROM data_change_log").pluck().get();
    const corrected = complete(parent.taskRef, true, 2000);
    expect(corrected.completedAt).toBe(2000);
    expect(corrected.revision).not.toBe(previous.revision);
    expect(readTask(db, child.taskRef)).toEqual(reopened);
    expect(
      db
        .prepare("SELECT entity_id FROM data_change_log WHERE domain='todo' AND seq>?")
        .pluck()
        .all(checkpoint)
    ).toEqual([taskKey(parent.taskRef)]);
    expect(complete(parent.taskRef, true, 2000).revision).toBe(corrected.revision);
    expect(complete(parent.taskRef, false).completedAt).toBeNull();
    expect(complete(parent.taskRef, true).completedAt).toBe(Date.now());
    expect(readTask(db, child.taskRef).completedAt).toBe(Date.now());
  });
  it("父项不能级联完成周期子项，旧界面停止后转回的普通任务仍能完成", () => {
    const parent = write("create_todo", { title: "父项", groupId });
    const child = write("create_todo", {
      title: "周期子项",
      groupId,
      parentRef: parent.taskRef,
      recurrence: { type: "daily", interval: 1, startDate: "2026-10-01" },
    });
    const currentParent = readTask(db, parent.taskRef);
    const rejected = engine.execute(
      "set_todo_completed",
      {
        requestId: "cascade-series",
        taskRef: parent.taskRef,
        revision: currentParent.revision,
        completed: true,
      },
      "b"
    );
    expect(rejected.status).toBe("failed");
    expect(readTask(db, parent.taskRef).completed).toBe(false);
    let current = readTask(db, child.taskRef);
    current = write("set_todo_recurrence", {
      taskRef: child.taskRef,
      revision: current.revision,
      effectiveDate: "2026-11-01",
      rule: null,
    });
    if (child.taskRef.kind !== "todo") throw new Error("fixture");
    db.prepare("UPDATE todo_item SET type='normal' WHERE id=?").run(child.taskRef.todoId);
    current = readTask(db, child.taskRef);
    const completed = write("set_todo_completed", {
      taskRef: child.taskRef,
      revision: current.revision,
      completed: true,
    });
    expect(completed.completed).toBe(true);
  });
  it("既有空字段规则可以读回重设，相同规则不因序列化或时钟改变版本", () => {
    const root = write("create_todo", {
      title: "旧规则",
      groupId,
      recurrence: { type: "weekly", interval: 1, startDate: "2026-10-01", weekdays: [1, 2] },
    });
    if (root.taskRef.kind !== "todo") throw new Error("fixture");
    const legacy = {
      type: "weekly",
      interval: 1,
      startDate: "2026-10-01",
      endDate: null,
      weekdays: [2, 1, 1],
      monthDay: null,
      yearMonth: null,
      yearDay: null,
      maxOccurrences: null,
      excludeHolidays: false,
    };
    db.prepare("UPDATE todo_recurrence_history SET rule_json=? WHERE todo_item_id=?").run(
      JSON.stringify(legacy),
      root.taskRef.todoId
    );
    const current = readTask(db, root.taskRef);
    const segment = current.recurrence![0];
    expect(segment.rule).toMatchObject({ weekdays: [1, 2] });
    expect(segment.rule!.monthDay).toBeUndefined();
    vi.setSystemTime(Date.now() + 10000);
    const result = write("set_todo_recurrence", {
      taskRef: root.taskRef,
      revision: current.revision,
      effectiveDate: segment.effectiveDate,
      rule: segment.rule,
    });
    expect(result.revision).toBe(current.revision);
  });
  it("实例状态分页在页间变化时拒绝混合版本，复合补丁失败不留半笔状态", () => {
    const root = write("create_todo", {
      title: "系列",
      groupId,
      recurrence: { type: "daily", interval: 1, startDate: "2026-10-01" },
    });
    for (const day of ["2026-10-01", "2026-10-02"]) {
      const instance = readTaskInstance(db, root.taskRef, day);
      write("update_todo_occurrence", {
        taskRef: root.taskRef,
        revision: instance.revision,
        occurrence: instance.occurrence,
        action: "patch",
        statePatch: { skipped: true },
      });
    }
    const first = queryOccurrenceStates(db, root.taskRef, 1);
    expect(first.cursor).toEqual(expect.any(String));
    const instance = readTaskInstance(db, root.taskRef, "2026-10-01");
    const invalid = engine.execute(
      "update_todo_occurrence",
      {
        requestId: "invalid-state",
        taskRef: root.taskRef,
        revision: instance.revision,
        occurrence: instance.occurrence,
        action: "patch",
        statePatch: { skipped: true, completed: true },
      },
      "b"
    );
    expect(invalid).toMatchObject({ status: "failed", error: { code: "INVALID_ARGUMENT" } });
    expect(readTaskInstance(db, root.taskRef, "2026-10-01").revision).toBe(instance.revision);
    write("update_todo_occurrence", {
      taskRef: root.taskRef,
      revision: instance.revision,
      occurrence: instance.occurrence,
      action: "patch",
      statePatch: { skipped: false },
    });
    expect(() => queryOccurrenceStates(db, root.taskRef, 1, first.cursor)).toThrow(
      "实例状态已变化"
    );
  });

  it("没有持久日期锚点的相对日期不随时钟被猜成截止日", () => {
    const ref = document();
    if (ref.kind !== "document") throw new Error("fixture");
    const nodes = ContentTable.getContentById(db, ref.contentId)!.content;
    const raw = JSON.parse(JSON.stringify(nodes));
    raw[0].children[0].children[0].children[0].text = "明天交报告";
    db.prepare("UPDATE contents SET content=? WHERE id=?").run(JSON.stringify(raw), ref.contentId);
    const before = readTask(db, ref);
    expect(before.dueAt).toBeNull();
    expect(before.title).toBe("明天交报告");
    vi.setSystemTime(new Date("2026-11-20T12:00:00+08:00"));
    expect(readTask(db, ref).revision).toBe(before.revision);
  });
  it("清单资格改变会使正文任务的旧版本失效，不能用旧字段覆盖当前归属", () => {
    const ref = document();
    let current = readTask(db, ref);
    current = write("update_todo", {
      taskRef: ref,
      revision: current.revision,
      patch: { groupId },
    });
    db.prepare("UPDATE todo_group SET is_archived=1 WHERE id=?").run(groupId);
    const latest = readTask(db, ref);
    expect(latest.groupId).toBeNull();
    expect(latest.revision).not.toBe(current.revision);
    const stale = engine.execute(
      "update_todo",
      {
        requestId: "stale-list",
        taskRef: ref,
        revision: current.revision,
        patch: { title: "覆盖" },
      },
      "b",
      "plugin:fixture"
    );
    expect(stale).toMatchObject({ status: "failed", error: { code: "VERSION_CONFLICT" } });
    expect(readTask(db, ref).title).toBe(latest.title);
  });
  it("旧正文单提醒可直接送达，扩为多个时刻后按新列表排期", () => {
    const ref = document();
    const index = new Database(":memory:");
    try {
      index.exec(indexSchema);
      const due = (hour: number) => new Date(2026, 10, 25, hour).getTime();
      const list = () => {
        reindexDocTasks(db, index, [ref.contentId]);
        return assistantReminders(db, index, due(21))
          .map(r => r.remindAt)
          .sort((a, b) => a - b);
      };
      let current = write("update_todo", {
        taskRef: ref,
        revision: readTask(db, ref).revision,
        patch: { reminderAt: new Date(due(8)).toISOString() },
      });
      expect(list()).toEqual([due(8)]);
      const times = [due(8), due(20)].map(time => ({ at: new Date(time).toISOString() }));
      current = write("update_todo", {
        taskRef: ref,
        revision: current.revision,
        patch: { reminders: times },
      });
      expect(list()).toEqual([due(8), due(20)]);
      write("update_todo", {
        taskRef: ref,
        revision: current.revision,
        patch: { reminders: [times[1]] },
      });
      expect(list()).toEqual([due(20)]);
    } finally {
      index.close();
    }
  });

  it("重复独立和正文待办各自排出两个当日时刻，完成的实例取消后续提醒", () => {
    const ref = document();
    const rule = { type: "daily" as const, interval: 1, startDate: "2026-11-25" };
    const offsets = [-8 * 3600000, -20 * 3600000];
    const root = write("create_todo", {
      title: "独立",
      groupId,
      recurrence: rule,
      reminderOffsets: [0, offsets[0]],
    });
    write("update_todo", {
      taskRef: root.taskRef,
      revision: root.revision,
      patch: { reminderOffsets: offsets },
    });
    const doc = write("create_todo", {
      title: "正文",
      document: {
        contentId: ref.contentId,
        createdAt: ref.createdAt,
        revision: must(readTask(db, ref).documentRevision, "正文版本"),
      },
      recurrence: rule,
      reminders: offsets.map(offsetMs => ({ offsetMs })),
    });
    const index = new Database(":memory:");
    try {
      index.exec(indexSchema);
      reindexDocTasks(db, index, [ref.contentId]);
      const list = () =>
        assistantReminders(db, index, new Date(2026, 10, 25, 21).getTime())
          .sort((a, b) => a.taskRef.kind.localeCompare(b.taskRef.kind) || a.remindAt - b.remindAt)
          .map(r => [r.taskRef.kind, new Date(r.remindAt).getHours()]);
      expect(list()).toEqual([
        ["document", 8],
        ["document", 20],
        ["todo", 8],
        ["todo", 20],
      ]);
      for (const target of [root.taskRef, doc.taskRef]) {
        const instance = readTaskInstance(db, target, rule.startDate);
        write("update_todo_occurrence", {
          taskRef: target,
          revision: instance.revision,
          occurrence: instance.occurrence,
          action: "patch",
          statePatch: { completed: true },
        });
      }
      expect(list()).toEqual([]);
    } finally {
      index.close();
    }
  });

  it("正文无截止提醒完整往返，清单修改保留任务身份，重复转换要求显式清空提醒", () => {
    const ref = document();
    let task = readTask(db, ref);
    task = write("update_todo", {
      taskRef: ref,
      revision: task.revision,
      patch: { reminders: [{ at: "2026-11-26T09:00:00+08:00" }], groupId },
    });
    expect(task).toMatchObject({
      taskRef: ref,
      dueAt: null,
      groupId,
      reminderAt: "2026-11-26T09:00:00+08:00",
    });
    const denied = engine.execute(
      "set_todo_recurrence",
      {
        requestId: "convert-with-reminder",
        taskRef: ref,
        revision: task.revision,
        effectiveDate: "2026-11-25",
        rule: { type: "daily", interval: 1, startDate: "2026-11-25" },
      },
      "b"
    );
    expect(denied.status).toBe("failed");
    expect(readTask(db, ref).revision).toBe(task.revision);
    task = write("update_todo", {
      taskRef: ref,
      revision: task.revision,
      patch: { reminders: [] },
    });
    task = write("set_todo_recurrence", {
      taskRef: ref,
      revision: task.revision,
      effectiveDate: "2026-11-25",
      rule: { type: "daily", interval: 1, startDate: "2026-11-25" },
    });
    task = write("update_todo", {
      taskRef: ref,
      revision: task.revision,
      patch: { reminders: [{ offsetMs: -32400000 }] },
    });
    expect(new Date(task.reminderAt!).getHours()).toBe(9);
    const instance = readTaskInstance(db, ref, "2026-11-25");
    write("update_todo_occurrence", {
      taskRef: ref,
      revision: instance.revision,
      occurrence: instance.occurrence,
      action: "patch",
      statePatch: { completed: true, scheduledAt: "2026-12-01" },
    });
    expect(readTaskInstance(db, ref, "2026-11-25")).toMatchObject({
      completed: true,
      dueAt: "2026-12-01",
      occurrence: instance.occurrence,
    });
  });
});
