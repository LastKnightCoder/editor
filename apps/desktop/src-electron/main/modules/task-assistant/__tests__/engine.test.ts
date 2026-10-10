import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
import MAIN_SCHEMA_SQL from "../../../../../../../packages/db-schema/schema/main.sql?raw";
import TodoGroupTable from "../../tables/todo-group";
import CalendarTable from "../../tables/calendar";
import CalendarEventTable from "../../tables/calendar-event";
import TodoCalendarSyncTable from "../../tables/todo-calendar-sync";
import ContentTable from "../../tables/content";
import { TaskAssistantEngine, readTask } from "../engine";
import { readCalendarEvent } from "../calendar";
import { revision } from "../common";
import type { AssistantTask, TaskRef } from "@tau/shared/task-assistant";
import { queryTasks } from "../query";
import TodoItemTable from "../../tables/todo-item";

describe("助理任务业务命令", () => {
  let db: Database.Database;
  let engine: TaskAssistantEngine;
  let groupId: number;
  let calendarId: number;
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    TodoGroupTable.ensureSystemGroups(db);
    TodoCalendarSyncTable.ensureTodoCalendars(db);
    groupId = TodoGroupTable.createGroup(db, { title: "工作" })!.id;
    calendarId = CalendarTable.createCalendar(db, {
      title: "工作",
      color: "blue",
      descriptionContentId: 0,
      archived: false,
      pinned: false,
      visible: true,
      orderIndex: 0,
    }).id;
    engine = new TaskAssistantEngine(db);
  });
  afterEach(() => db.close());
  const create = (requestId = "create") => {
    const result = engine.execute("create_todo", { requestId, title: "写方案", groupId }, "batch");
    expect(result.status).toBe("succeeded");
    return { result, task: result.result as AssistantTask };
  };
  it("创建幂等，重启执行器后同一请求仍只有一条待办", () => {
    const first = create();
    engine = new TaskAssistantEngine(db);
    const second = create();
    expect(second.result.operationId).toBe(first.result.operationId);
    expect(db.prepare("SELECT COUNT(*) AS n FROM todo_item WHERE title='写方案'").get()).toEqual({
      n: 1,
    });
    expect(
      engine.execute("create_todo", { requestId: "create", title: "别的任务", groupId }, "b")
    ).toMatchObject({ status: "failed", error: { code: "IDEMPOTENCY_CONFLICT" } });
  });
  it("修改拒绝旧版本；撤销不覆盖后续手动修改", () => {
    const { task } = create();
    const result = engine.execute(
      "update_todo",
      {
        requestId: "rename",
        taskRef: task.taskRef,
        revision: task.revision,
        patch: { title: "新标题" },
      },
      "b"
    );
    expect(result.status).toBe("succeeded");
    expect(
      engine.execute(
        "update_todo",
        {
          requestId: "stale",
          taskRef: task.taskRef,
          revision: task.revision,
          patch: { title: "覆盖" },
        },
        "b"
      )
    ).toMatchObject({ status: "failed", error: { code: "VERSION_CONFLICT" } });
    db.prepare("UPDATE todo_item SET title='手动编辑' WHERE id=?").run(
      (task.taskRef as Extract<TaskRef, { kind: "todo" }>).todoId
    );
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "undo", operationId: result.operationId },
        "b"
      )
    ).toMatchObject({ status: "failed", error: { code: "UNDO_CONFLICT" } });
  });
  it("删除未来安排，保留过去安排，撤销恢复关联", () => {
    const { task } = create();
    for (const [requestId, start, end] of [
      ["past", "2001-01-01T09:00:00+08:00", "2001-01-01T10:00:00+08:00"],
      ["future", "2099-01-01T09:00:00+08:00", "2099-01-01T10:00:00+08:00"],
    ]) {
      const current = readTask(db, task.taskRef);
      expect(
        engine.execute(
          "create_calendar_event",
          {
            requestId,
            taskRef: task.taskRef,
            revision: current.revision,
            calendarId,
            start,
            end,
            allDay: false,
          },
          "b"
        ).status
      ).toBe("succeeded");
    }
    const current = readTask(db, task.taskRef);
    const deleted = engine.execute(
      "delete_todo",
      { requestId: "delete", taskRef: task.taskRef, revision: current.revision },
      "b"
    );
    expect(deleted.status).toBe("succeeded");
    expect(
      db.prepare("SELECT todo_item_id FROM calendar_event WHERE calendar_id=?").all(calendarId)
    ).toEqual([{ todo_item_id: null }]);
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "undo", operationId: deleted.operationId },
        "b"
      ).status
    ).toBe("succeeded");
    expect(
      db.prepare("SELECT COUNT(*) n FROM calendar_event WHERE todo_item_id IS NOT NULL").get()
    ).toEqual({ n: 2 });
  });
  it("关联安排失败时，创建待办及操作日志同事务回滚", () => {
    const result = engine.execute(
      "create_todo",
      {
        requestId: "invalid",
        title: "不能残留",
        groupId,
        schedule: { calendarId: 999, start: "2026-10-11", end: "2026-10-12", allDay: true },
      },
      "b"
    );
    expect(result.status).toBe("failed");
    expect(db.prepare("SELECT COUNT(*) n FROM todo_item").get()).toEqual({ n: 0 });
  });
  it("删除日程保留待办，撤销恢复原日程身份", () => {
    const { task } = create();
    const created = engine.execute(
      "create_calendar_event",
      {
        requestId: "event",
        taskRef: task.taskRef,
        revision: task.revision,
        calendarId,
        start: "2026-10-11",
        end: "2026-10-12",
        allDay: true,
      },
      "b"
    );
    expect(created.status).toBe("succeeded");
    const event = readCalendarEvent(db, (created.result as { eventId: number }).eventId);
    const deleted = engine.execute(
      "delete_calendar_event",
      {
        requestId: "delete-event",
        eventId: event.eventId,
        createdAt: event.createdAt,
        revision: event.revision,
      },
      "b"
    );
    expect(deleted.status).toBe("succeeded");
    expect(readTask(db, task.taskRef).title).toBe("写方案");
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "undo-event", operationId: deleted.operationId },
        "b"
      ).status
    ).toBe("succeeded");
    expect(readCalendarEvent(db, event.eventId).createdAt).toBe(event.createdAt);
  });
  it("单次改期保持身份，停止后保留此前实例及完成记录", () => {
    const created = engine.execute(
      "create_todo",
      {
        requestId: "cycle",
        title: "周期",
        groupId,
        recurrence: { type: "daily", interval: 1, startDate: "2026-10-10" },
      },
      "b"
    );
    expect(created.status).toBe("succeeded");
    const task = created.result as AssistantTask;
    const seriesId = task.recurrence![0].seriesId;
    let current = readTask(db, task.taskRef);
    expect(
      engine.execute(
        "set_todo_completed",
        {
          requestId: "done-first",
          taskRef: task.taskRef,
          revision: current.revision,
          completed: true,
          occurrence: { seriesId, occurrenceDate: "2026-10-10" },
        },
        "b"
      ).status
    ).toBe("succeeded");
    current = readTask(db, task.taskRef);
    expect(
      engine.execute(
        "update_todo_occurrence",
        {
          requestId: "move-one",
          taskRef: task.taskRef,
          revision: current.revision,
          occurrence: { seriesId, occurrenceDate: "2026-10-11" },
          action: "reschedule",
          scheduledAt: "2026-10-13",
        },
        "b"
      ).status
    ).toBe("succeeded");
    current = readTask(db, task.taskRef);
    expect(
      engine.execute(
        "set_todo_recurrence",
        {
          requestId: "stop",
          taskRef: task.taskRef,
          revision: current.revision,
          effectiveDate: "2026-10-12",
          rule: null,
        },
        "b"
      ).status
    ).toBe("succeeded");
    const instances = queryTasks(db, undefined, "test", {
      source: "todo",
      view: "occurrences",
      start: "2026-10-10",
      end: "2026-10-14",
    }).items;
    expect(
      instances.map(item => [item.occurrence!.occurrenceDate, item.dueAt, item.completed])
    ).toEqual([
      ["2026-10-10", "2026-10-10", true],
      ["2026-10-11", "2026-10-13", false],
    ]);
  });
  it.each(["todo", "document"] as const)("%s 的不同周期实例可使用同一次查询结果逐项完成", kind => {
    let document: { contentId: number; createdAt: number; revision: string } | undefined;
    if (kind === "document") {
      const contentId = ContentTable.createContent(db, {
        content: [{ type: "paragraph", children: [{ text: "正文" }] }] as never,
      });
      db.prepare(
        "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('正文',?,1,1)"
      ).run(contentId);
      const content = ContentTable.getContentById(db, contentId)!;
      document = { contentId, createdAt: content.createTime, revision: revision(content.content) };
    }
    const created = engine.execute(
      "create_todo",
      {
        requestId: `series-${kind}`,
        title: "周期任务",
        ...(document ? { document } : { groupId }),
        recurrence: { type: "daily", interval: 1, startDate: "2026-10-10" },
      },
      "b"
    );
    expect(created.status).toBe("succeeded");
    const task = created.result as AssistantTask;
    const instances = queryTasks(db, undefined, "test", {
      taskRefs: [task.taskRef],
      view: "occurrences",
      start: "2026-10-10",
      end: "2026-10-11",
    }).items;
    expect(instances).toHaveLength(2);
    for (const [index, item] of instances.entries())
      expect(
        engine.execute(
          "set_todo_completed",
          {
            requestId: `done-${kind}-${index}`,
            taskRef: item.taskRef,
            revision: item.revision,
            occurrence: item.occurrence,
            completed: true,
          },
          "batch"
        ).status
      ).toBe("succeeded");
  });
  it("删除保留正文引用，过期清理只释放操作持有的引用", () => {
    const { task } = create();
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "备注" }] }] as never,
    });
    const id = (task.taskRef as Extract<TaskRef, { kind: "todo" }>).todoId;
    TodoItemTable.updateItem(db, { id, descriptionContentId: contentId });
    const current = readTask(db, task.taskRef);
    const result = engine.execute(
      "delete_todo",
      { requestId: "delete-with-content", taskRef: task.taskRef, revision: current.revision },
      "b"
    );
    expect(result.status).toBe("succeeded");
    expect(ContentTable.getContentById(db, contentId)?.refCount).toBe(1);
    db.prepare("UPDATE task_assistant_operation SET undo_until=0 WHERE id=?").run(
      result.operationId
    );
    engine.prune();
    expect(ContentTable.getContentById(db, contentId)).toBeNull();
    expect(
      db
        .prepare("SELECT status,request_hash FROM task_assistant_operation WHERE id=?")
        .get(result.operationId)
    ).toMatchObject({ status: "succeeded" });
  });
  it("正文写入前校验安排；已保存正文但联动失败时仍可撤销", () => {
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "原文" }] }] as never,
    });
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('原文',?,1,1)"
    ).run(contentId);
    const content = ContentTable.getContentById(db, contentId)!;
    const document = {
      contentId,
      createdAt: content.createTime,
      revision: revision(content.content),
    };
    const input = {
      title: "待安排",
      document,
      schedule: { calendarId, start: "2026-10-10", end: "2026-10-11", allDay: true },
    };
    expect(
      engine.execute(
        "create_todo",
        {
          ...input,
          requestId: "invalid-doc-schedule",
          schedule: { ...input.schedule, calendarId: 999999 },
        },
        "b"
      ).status
    ).toBe("failed");
    expect(ContentTable.getContentById(db, contentId)!.content).toEqual(content.content);
    const failure = vi.spyOn(CalendarEventTable, "createEvent").mockImplementationOnce(() => {
      throw new Error("模拟日历写入失败");
    });
    const pending = engine.execute("create_todo", { ...input, requestId: "pending-doc" }, "b");
    failure.mockRestore();
    expect(pending.status).toBe("pending");
    expect(pending.undoableUntil).toBeGreaterThan(Date.now());
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "undo-pending", operationId: pending.operationId },
        "b"
      ).status
    ).toBe("succeeded");
    expect(ContentTable.getContentById(db, contentId)!.content).toEqual(content.content);
  });
  it("原项目编号被复用后，不把删除的待办恢复到新项目", () => {
    const { task } = create();
    const removed = engine.execute(
      "delete_todo",
      { requestId: "delete-for-group", taskRef: task.taskRef, revision: task.revision },
      "b"
    );
    expect(removed.status).toBe("succeeded");
    db.prepare("DELETE FROM todo_group WHERE id=?").run(groupId);
    db.prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(?,?,?,?)").run(
      groupId,
      "新项目",
      Date.now() + 1000,
      Date.now() + 1000
    );
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "undo-new-group", operationId: removed.operationId },
        "b"
      )
    ).toMatchObject({ status: "failed", error: { code: "UNDO_CONFLICT" } });
    expect(db.prepare("SELECT count(*) n FROM todo_item").get()).toEqual({ n: 0 });
  });
  it("正文待办的创建修改删除与撤销保留其他正文", () => {
    const contentId = ContentTable.createContent(db, {
      content: [
        { type: "paragraph", children: [{ type: "formatted", text: "保留段落" }] },
      ] as never,
    });
    const content = ContentTable.getContentById(db, contentId)!;
    db.prepare(
      "INSERT INTO articles(title,content_id,create_time,update_time) VALUES('正文',?,100,100)"
    ).run(contentId);
    const created = engine.execute(
      "create_todo",
      {
        requestId: "doc-create",
        title: "正文任务",
        document: { contentId, createdAt: content.createTime, revision: revision(content.content) },
      },
      "b"
    );
    expect(created.status).toBe("succeeded");
    const task = created.result as AssistantTask;
    const renamed = engine.execute(
      "update_todo",
      {
        requestId: "doc-rename",
        taskRef: task.taskRef,
        revision: task.revision,
        patch: { title: "新任务", dueAt: "2026-10-15" },
      },
      "b"
    );
    expect(renamed.status).toBe("succeeded");
    const fresh = readTask(db, task.taskRef);
    expect(fresh.title).toBe("新任务");
    const deleted = engine.execute(
      "delete_todo",
      { requestId: "doc-delete", taskRef: task.taskRef, revision: fresh.revision },
      "b"
    );
    expect(deleted.status).toBe("succeeded");
    expect(
      engine.execute(
        "undo_task_operation",
        { requestId: "doc-undo", operationId: deleted.operationId },
        "b"
      ).status
    ).toBe("succeeded");
    expect(readTask(db, task.taskRef).title).toBe("新任务");
    expect(ContentTable.getContentById(db, contentId)!.content[0]).toEqual(content.content[0]);
  });
});
