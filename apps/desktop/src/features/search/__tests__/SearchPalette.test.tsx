import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { SearchPalette } from "../SearchPalette";
import { useSearchStore } from "../searchStore";

vi.mock("@/page/PageProvider", () => {
  const navigator = { push: vi.fn() };
  const state = { back: [{ key: "home" }] };
  return { usePage: () => ({ navigator, state }), useOverlayDismiss: vi.fn() };
});
vi.mock("../queries", () => ({
  useSearchContent: () => ({
    data: [],
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  resultDisplay: () => ({ title: "", snippet: "" }),
  relativeTime: () => "",
}));
vi.mock("@/features/todos/queries", () => ({
  useTodoGroups: () => [],
  createTodoFromQuickAdd: vi.fn(),
}));
vi.mock("@/features/schedule/queries", () => ({
  useCalendarCatalog: () => ({ calendars: [] }),
  useScheduleMutations: () => ({ createEvent: vi.fn() }),
}));
vi.mock("@/services/open-content", () => ({ openEntity: vi.fn() }));
vi.mock("@/services/open-material", () => ({ openMaterialTarget: vi.fn() }));
vi.mock("@/commands/file", () => ({ openMarkdownInNewWindow: vi.fn() }));
vi.mock("@/commands/perf", () => ({ exportPerfSnapshot: vi.fn() }));
vi.mock("@/commands/question", () => ({ captureQuestion: vi.fn() }));
vi.mock("@/services/question-capture", () => ({
  subscribeQuestionCapture: () => () => undefined,
  submitQuestionCapture: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;
const executed = vi.fn();
const scroll = vi.fn();
function rows() {
  return [...container.querySelectorAll<HTMLElement>('[role="option"]')];
}
function input() {
  const element = container.querySelector("input");
  if (!element) throw new Error("面板输入框缺失");
  return element;
}
function resultList() {
  const element = container.querySelector<HTMLDivElement>(".overflow-y-auto");
  if (!element) throw new Error("结果滚动容器缺失");
  return element;
}
async function key(key: string) {
  await act(async () =>
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  );
}

beforeEach(async () => {
  executed.mockClear();
  scroll.mockClear();
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
    this: HTMLElement
  ) {
    scroll(this.dataset.idx);
    resultList().scrollTop = Number(this.dataset.idx) * 40;
  });
  runtime = new DesktopPluginRuntime({
    workspaceId: "test",
    storage: createMemoryStorage(),
    navigator: { push: vi.fn() },
    plugins: [
      definePlugin({
        id: "test.palette",
        name: "回归夹具",
        version: "1.0.0",
        create: () => ({
          activate(ctx) {
            for (let i = 0; i < 60; i++)
              ctx.commands.register({
                id: `run-${i}`,
                title: `回归命令 ${i}`,
                run: () => {
                  executed(i);
                  return null;
                },
              });
          },
        }),
      }),
    ],
  });
  await runtime.host.enable("test.palette");
  useSearchStore.setState({ open: false, visits: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <PluginRuntimeContext.Provider value={runtime}>
        <SearchPalette />
      </PluginRuntimeContext.Provider>
    )
  );
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))
  );
  expect(useSearchStore.getState().open).toBe(true);
  const commandsChip = [...container.querySelectorAll("button")].find(
    button => button.textContent === "命令与页面"
  );
  if (!commandsChip) throw new Error("命令筛选缺失");
  await act(async () => commandsChip.click());
  expect(rows().length).toBeGreaterThan(60);
  scroll.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  await runtime.dispose();
  container.remove();
  vi.restoreAllMocks();
});

it("滚到底部后悬停和点击不归零、不抢滚动，执行实际点击命令", async () => {
  resultList().scrollTop = 2400;
  const last = rows().at(-1);
  if (!last) throw new Error("结果缺失");
  await act(async () => last.dispatchEvent(new MouseEvent("mousemove", { bubbles: true })));
  expect(last.getAttribute("aria-selected")).toBe("true");
  expect(resultList().scrollTop).toBe(2400);
  expect(scroll).not.toHaveBeenCalled();
  await act(async () => {
    last.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    last.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    last.click();
  });
  expect(executed).toHaveBeenCalledExactlyOnceWith(59);
  expect(useSearchStore.getState().open).toBe(false);
});

it("键盘上下键仍滚动到选中项并可回车执行，不受新数组引用影响", async () => {
  await key("ArrowUp");
  const lastIndex = rows().length - 1;
  expect(rows()[lastIndex].getAttribute("aria-selected")).toBe("true");
  expect(scroll).toHaveBeenLastCalledWith(String(lastIndex));
  await key("ArrowUp");
  expect(rows()[lastIndex - 1].getAttribute("aria-selected")).toBe("true");
  expect(scroll).toHaveBeenLastCalledWith(String(lastIndex - 1));
  await key("Enter");
  expect(executed).toHaveBeenCalledExactlyOnceWith(58);
});

it("插件状态更新但结果不变时保留位置，实际移除命令时重置选择", async () => {
  const last = rows().at(-1);
  if (!last) throw new Error("结果缺失");
  await act(async () => last.dispatchEvent(new MouseEvent("mousemove", { bubbles: true })));
  resultList().scrollTop = 2400;
  await act(async () =>
    runtime.host.registerTrusted(
      definePlugin({
        id: "test.inactive",
        name: "未启用插件",
        version: "1.0.0",
        create: () => ({ activate: () => undefined }),
      })
    )
  );
  expect(last.getAttribute("aria-selected")).toBe("true");
  expect(resultList().scrollTop).toBe(2400);
  await act(async () => runtime.host.disable("test.palette"));
  expect(rows()[0].getAttribute("aria-selected")).toBe("true");
  expect(resultList().scrollTop).toBe(0);
  expect(rows().some(row => row.textContent?.includes("回归命令"))).toBe(false);
});

it("插件的文字动作排在「记录」组末尾，回车把输入的文字交给插件", async () => {
  const run = vi.fn();
  await act(async () => {
    runtime.host.registerTrusted(
      definePlugin({
        id: "test.text",
        name: "问题插件",
        version: "1.0.0",
        create: () => ({
          activate(ctx) {
            ctx.actions.register({ id: "note", title: "记为问题", targets: ["text"], run });
            ctx.actions.register({ id: "card", title: "卡片动作", targets: ["card"], run });
          },
        }),
      })
    );
    await runtime.host.enable("test.text");
  });
  // 取消「命令与页面」筛选，输入文字
  const commandsChip = [...container.querySelectorAll("button")].find(
    button => button.textContent === "命令与页面"
  );
  await act(async () => commandsChip?.click());
  await act(async () => {
    const element = input();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      element,
      "渲染为什么会卡"
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const titles = rows().map(row => row.textContent ?? "");
  const pluginIndex = titles.findIndex(text =>
    text.includes("记为问题：渲染为什么会卡来自「问题插件」")
  );
  expect(pluginIndex).toBe(titles.length - 1);
  expect(titles.some(text => text.includes("卡片动作"))).toBe(false);
  await act(async () => rows()[pluginIndex].click());
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  expect(run).toHaveBeenCalledWith({ kind: "text", text: "渲染为什么会卡" });
  expect(useSearchStore.getState().open).toBe(false);
});
