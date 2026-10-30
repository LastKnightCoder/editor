import { beforeEach, expect, it, vi } from "vitest";
import type { AiToolExecutionContext } from "@tau/ai/contracts";

const tauri = vi.hoisted(() => ({
  todoListGroups: vi.fn(),
  todoListItemsByType: vi.fn(),
  todoCreateItem: vi.fn(),
  todoUpdateItem: vi.fn(),
  todoToggleCompleteCascade: vi.fn(),
  todoDeleteItem: vi.fn(),
  todoDeleteItemCascade: vi.fn(),
  calendarGetAll: vi.fn(),
  calendarEventGetByDateRange: vi.fn(),
  calendarEventGetById: vi.fn(),
  calendarEventCreate: vi.fn(),
  calendarEventUpdate: vi.fn(),
  calendarEventDelete: vi.fn(),
  localTimeZone: () => "Asia/Shanghai",
}));
vi.mock("../../tauri", () => tauri);
vi.mock("../../../features/calendar/cache", () => ({ invalidateCalendarQueries: vi.fn() }));
vi.mock("../../../router/query/PageQueryProvider", () => ({
  getQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import {
  createCalendarEventTool,
  createTodoTool,
  deleteTodoTool,
  parseLocal,
  queryTodosTool,
  setTodoCompletedTool,
  updateTodoTool,
} from "../taskTools";
import type { HostTool } from "../tool";

const context = {} as AiToolExecutionContext;
const run = async (tool: HostTool, input: Record<string, unknown>) =>
  JSON.parse((await tool.execute(input, context)).content);

const day = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();
const item = (id: number, patch: object = {}) => ({
  id,
  groupId: 1,
  parentId: null,
  title: `待办 ${id}`,
  type: "normal",
  isCompleted: false,
  isArchived: false,
  dueAt: null,
  sortIndex: id,
  createTime: 1,
  updateTime: 100 + id,
  recurrence: null,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  tauri.todoListGroups.mockResolvedValue([
    { id: 9, title: "全部", isSystem: true, isArchived: false },
    { id: 1, title: "工作", isSystem: false, isArchived: false },
  ]);
  tauri.todoListItemsByType.mockResolvedValue([
    item(1, { dueAt: day(2026, 10, 29, 18) }),
    item(2, { title: "写周报", dueAt: day(2026, 11, 2) }),
    item(3, { parentId: 2 }),
    item(4, { isArchived: true }),
  ]);
});

it("解析本地时间：全天与定时，拒绝非法日期", () => {
  expect(parseLocal("2026-10-30")).toEqual({ day: day(2026, 10, 30), minutes: null });
  expect(parseLocal("2026-10-30T09:30")).toEqual({ day: day(2026, 10, 30), minutes: 570 });
  expect(parseLocal("2026-02-30")).toBeNull();
  expect(parseLocal("2026-10-30T25:00")).toBeNull();
});

it("query_todos 按关键词、截止日期筛选，默认排除归档，返回身份与版本", async () => {
  const all = await run(queryTodosTool, {});
  expect(all.items.map((value: { taskRef: string }) => value.taskRef)).toEqual(["1", "2", "3"]);
  const result = await run(queryTodosTool, {
    keyword: "周报",
    start: "2026-11-01",
    end: "2026-11-30",
  });
  expect(result.items).toEqual([
    expect.objectContaining({ taskRef: "2", revision: "102", dueAt: "2026-11-02", group: "工作" }),
  ]);
});

it("create_todo 缺省落到第一个非系统清单，解析截止时间", async () => {
  tauri.todoCreateItem.mockImplementation(async payload => item(7, payload));
  const result = await run(createTodoTool, { title: " 买牛奶 ", dueAt: "2026-10-31T09:00" });
  expect(tauri.todoCreateItem).toHaveBeenCalledWith({
    groupId: 1,
    parentId: null,
    title: "买牛奶",
    dueAt: day(2026, 10, 31, 9),
  });
  expect(result).toMatchObject({
    success: true,
    item: { title: "买牛奶", dueAt: "2026-10-31T09:00" },
  });
});

it("写入前校验版本：过期版本返回冲突并附最新状态，不写入", async () => {
  const result = await run(updateTodoTool, { taskRef: "1", revision: "1", patch: { title: "新" } });
  expect(result).toMatchObject({ success: false, errorCode: "TASK_REVISION_CONFLICT" });
  expect(result.current.revision).toBe("101");
  expect(tauri.todoUpdateItem).not.toHaveBeenCalled();
});

it("update_todo 用 null 清空截止时间", async () => {
  tauri.todoUpdateItem.mockImplementation(async payload => item(1, payload));
  await run(updateTodoTool, { taskRef: "1", revision: "101", patch: { dueAt: null } });
  expect(tauri.todoUpdateItem).toHaveBeenCalledWith({ id: 1, dueAt: null });
});

it("有子待办时删除须明确 cascade；周期任务不支持单次完成", async () => {
  expect(await run(deleteTodoTool, { taskRef: "2", revision: "102" })).toMatchObject({
    errorCode: "TASK_HAS_CHILDREN",
  });
  await run(deleteTodoTool, { taskRef: "2", revision: "102", children: "cascade" });
  expect(tauri.todoDeleteItemCascade).toHaveBeenCalledWith(2);

  tauri.todoListItemsByType.mockResolvedValue([item(5, { recurrence: { id: 1 } })]);
  expect(
    await run(setTodoCompletedTool, { taskRef: "5", revision: "105", completed: true })
  ).toMatchObject({ errorCode: "RECURRING_UNSUPPORTED" });
  expect(tauri.todoToggleCompleteCascade).not.toHaveBeenCalled();
});

it("create_calendar_event：全天 end 不含当天，定时须晚于开始，系统日历不可写", async () => {
  tauri.calendarGetAll.mockResolvedValue([
    { id: 3, title: "待办", isInSystemGroup: true, archived: false },
    { id: 4, title: "个人", isInSystemGroup: false, archived: false },
  ]);
  tauri.calendarEventCreate.mockImplementation(async payload => ({
    id: 11,
    calendarTitle: "个人",
    isInSystemEvent: false,
    ...payload,
  }));
  await run(createCalendarEventTool, {
    title: "出差",
    start: "2026-11-02",
    end: "2026-11-05",
    allDay: true,
  });
  expect(tauri.calendarEventCreate).toHaveBeenLastCalledWith({
    calendarId: 4,
    title: "出差",
    startDate: day(2026, 11, 2),
    endDate: day(2026, 11, 4),
    startTime: null,
    endTime: null,
    allDay: true,
  });
  const meeting = await run(createCalendarEventTool, {
    title: "评审",
    start: "2026-10-30T10:30",
    end: "2026-10-30T11:00",
    allDay: false,
  });
  expect(meeting.event).toMatchObject({ start: "2026-10-30T10:30", end: "2026-10-30T11:00" });
  expect(
    await run(createCalendarEventTool, {
      title: "错",
      start: "2026-10-30T11:00",
      end: "2026-10-30T10:00",
      allDay: false,
    })
  ).toMatchObject({ errorCode: "INVALID_TIME" });
  expect(
    await run(createCalendarEventTool, {
      title: "错",
      start: "2026-10-30",
      end: "2026-10-31",
      allDay: true,
      calendarId: "3",
    })
  ).toMatchObject({ errorCode: "CALENDAR_NOT_FOUND" });
});
