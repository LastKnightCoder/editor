import { expect, it, vi } from "vitest";
import type { MobileEntityOpenOptions, MobileEntityOpenTarget } from "./app-types";
import { navigateMobileEntity } from "./entityNavigation";

it.each([
  [{ kind: "card", id: 1 }, "contentDetail", { cardId: 1 }],
  [{ kind: "article", id: 2 }, "articleEditor", { articleId: 2 }],
  [{ kind: "document", id: 3 }, "projectDocEditor", { itemId: 3, projectTitle: "" }],
  [{ kind: "project", id: 4 }, "projectDetail", { projectId: 4 }],
  [{ kind: "todo", id: 5, groupId: 12 }, "todoDetail", { todoId: 5, groupId: 12 }],
  [{ kind: "event", id: 6 }, "calendarEventDetail", { eventId: 6 }],
  [
    { kind: "document-task", contentId: 7, taskId: "nested:task@source" },
    "contentDetail",
    { contentId: 7, taskId: "nested:task@source" },
  ],
] as const)("将已校验的 %j 打开到对应业务页", (target, key, params) => {
  const navigator = { push: vi.fn() };
  navigateMobileEntity(navigator, target, { placement: "page" });
  expect(navigator.push).toHaveBeenCalledExactlyOnceWith(key, params);
});

it.each([{ placement: "window" }, { placement: "dock" }] satisfies MobileEntityOpenOptions[])(
  "不默默降级不支持的打开选项 %j",
  options => {
    const navigator = { push: vi.fn() };
    expect(() => navigateMobileEntity(navigator, { kind: "card", id: 1 }, options)).toThrow();
    expect(navigator.push).not.toHaveBeenCalled();
  }
);

it.each([
  { kind: "event", id: -100 },
  { kind: "todo", id: 1, groupId: 0 },
  { kind: "card", id: 1.5 },
  { kind: "document-task", contentId: 1, taskId: "" },
  { kind: "whiteboard", id: 1 },
])("拒绝错误目标，虚拟日程不误开为实体日程 %j", target => {
  const navigator = { push: vi.fn() };
  expect(() =>
    navigateMobileEntity(navigator, target as MobileEntityOpenTarget, { placement: "page" })
  ).toThrow();
  expect(navigator.push).not.toHaveBeenCalled();
});

it.each(["card", "article", "document"] as const)(
  "%s 携带定位参数，重复定位使用新请求标识",
  kind => {
    const navigator = { push: vi.fn() };
    navigateMobileEntity(navigator, { kind, id: 1 }, { placement: "page", at: { block: 0 } });
    navigateMobileEntity(navigator, { kind, id: 1 }, { placement: "page", at: { block: 0 } });
    const first = navigator.push.mock.calls[0][1];
    const second = navigator.push.mock.calls[1][1];
    expect(first.block).toBe(0);
    expect(second.block).toBe(0);
    expect(first.locationRequestId).not.toBe(second.locationRequestId);
  }
);
it.each([-1, 0.5, NaN, Infinity])("拒绝非法块序号 %s", block => {
  const navigator = { push: vi.fn() };
  expect(() =>
    navigateMobileEntity(navigator, { kind: "card", id: 1 }, { placement: "page", at: { block } })
  ).toThrow("非负整数");
  expect(navigator.push).not.toHaveBeenCalled();
});
it("非正文类型不接受块定位", () => {
  const navigator = { push: vi.fn() };
  expect(() =>
    navigateMobileEntity(
      navigator,
      { kind: "project", id: 1 },
      { placement: "page", at: { block: 0 } }
    )
  ).toThrow("不支持");
  expect(navigator.push).not.toHaveBeenCalled();
});
