import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scheduleTodo: vi.fn(),
  deleteEvent: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../queries", () => ({
  useScheduleMutations: () => ({
    scheduleTodo: mocks.scheduleTodo,
    deleteEvent: mocks.deleteEvent,
  }),
}));
vi.mock("@tau/ui", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { useScheduleTodo } from "../todoDrop";

const DAY = new Date(2026, 9, 8).getTime();
let host: HTMLDivElement;
let root: Root;
let schedule: ReturnType<typeof useScheduleTodo>;
function Probe() {
  schedule = useScheduleTodo();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scheduleTodo.mockResolvedValue({ id: 17, title: "写报告" });
  mocks.deleteEvent.mockResolvedValue(1);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("全天安排只提交日期和待办，回执显示全天且能撤销", async () => {
  await schedule(3, DAY, null);
  expect(mocks.scheduleTodo).toHaveBeenCalledExactlyOnceWith({
    todoItemId: 3,
    startDate: DAY,
    allDay: true,
  });
  expect(mocks.success).toHaveBeenCalledWith("已安排「写报告」· 10月8日 全天", expect.any(Object));
  const { action } = mocks.success.mock.calls[0][1];
  expect(action.label).toBe("撤销");
  await action.onClick();
  expect(mocks.deleteEvent).toHaveBeenCalledExactlyOnceWith(17);
});

it("定时安排保留默认一小时、指定时长及日末截断", async () => {
  await schedule(3, DAY, 540);
  expect(mocks.scheduleTodo).toHaveBeenLastCalledWith({
    todoItemId: 3,
    startDate: DAY,
    startTime: 540,
    endTime: 600,
  });
  expect(mocks.success.mock.calls[0][0]).toContain("09:00");
  await schedule(3, DAY, 540, 30);
  expect(mocks.scheduleTodo.mock.calls[1][0].endTime).toBe(570);
  await schedule(3, DAY, 1425);
  expect(mocks.scheduleTodo.mock.calls[2][0].endTime).toBe(1439);
});

describe("创建失败", () => {
  it.each([
    ["NO_USER_CALENDAR: 请先创建一个日历", "请先创建一个日历"],
    ["数据库写入失败", "安排失败"],
    ["Todo 3 not found", "安排失败"],
  ])("%s", async (message, expected) => {
    mocks.scheduleTodo.mockRejectedValueOnce(new Error(message));
    await schedule(3, DAY, null);
    expect(mocks.error).toHaveBeenCalledWith(expected);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.deleteEvent).not.toHaveBeenCalled();
  });
});
