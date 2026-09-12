import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OverlayHost,
  PageHost,
  RouterProvider,
  definePage,
  getNavigator,
  useBackHandler,
  usePage,
  usePageLifecycle,
  useSheetBackDismiss,
  paramNumber,
} from "../index";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { clearPageDefinitionsForTest } from "../registry";
import { clearPageMetasForTest } from "../core/pageMeta";

function CounterPage() {
  const { params, navigator } = usePage<{ todoId: number }>();
  const [value, setValue] = useState("");
  usePageLifecycle({
    onInit: () => events.push("init"),
    onEnter: () => events.push("enter"),
    onEntered: () => events.push("entered"),
    onPause: () => events.push("pause"),
    onResume: () => events.push("resume"),
    onDestroy: () => events.push("destroy"),
  });
  return (
    <div>
      <span data-testid="params">{params.todoId}</span>
      <input aria-label="draft" value={value} onChange={e => setValue(e.target.value)} />
      <button
        type="button"
        onClick={() => navigator.push("todoDetail", { todoId: params.todoId + 1 })}
      >
        deeper
      </button>
      <button type="button" onClick={() => navigator.goBack("ui")}>
        back
      </button>
    </div>
  );
}

function PickerPage() {
  const { navigator } = usePage();
  return (
    <button type="button" onClick={() => navigator.finish({ picked: 42 })}>
      pick
    </button>
  );
}

// 页内双本地 Sheet（模拟 useSheetBackDismiss 的目标场景）：
// sheetA 先声明、sheetB 后声明（后声明的消费优先级更高，LIFO）
function SheetHostPage() {
  const [sheetAOpen, setSheetAOpen] = useState(false);
  const [sheetBOpen, setSheetBOpen] = useState(false);
  useSheetBackDismiss(sheetAOpen, () => setSheetAOpen(false));
  useSheetBackDismiss(sheetBOpen, () => setSheetBOpen(false));
  return (
    <div>
      <span data-testid="sheet-a">{String(sheetAOpen)}</span>
      <span data-testid="sheet-b">{String(sheetBOpen)}</span>
      <button type="button" onClick={() => setSheetAOpen(true)}>
        open-a
      </button>
      <button type="button" onClick={() => setSheetBOpen(true)}>
        open-b
      </button>
    </div>
  );
}

const events: string[] = [];

function registerPages() {
  definePage({
    key: "home",
    params: {},
    component: () => <div data-testid="root">ROOT</div>,
  });
  definePage({
    key: "todoDetail",
    match: "multi",
    params: { todoId: paramNumber() },
    component: CounterPage,
  });
  definePage({
    key: "cardPicker",
    layer: "overlay",
    params: {},
    component: PickerPage,
  });
  definePage({
    key: "sheetHost",
    params: {},
    component: SheetHostPage,
  });
  definePage({
    key: "containerHost",
    params: {},
    component: ContainerHostPage,
  });
  definePage({
    key: "confirmHost",
    params: {},
    component: ConfirmHostPage,
  });
}

// 容器组件内置拦截的宿主页：页内 BottomSheet（默认拦截 / 显式关闭）+ 页面级 backHandler
const arbitrationOrder: string[] = [];
function ContainerHostPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optOutOpen, setOptOutOpen] = useState(false);
  useBackHandler(() => {
    arbitrationOrder.push("page");
    return false; // 页面级不消费，仅记录询问顺序
  });
  return (
    <div>
      <span data-testid="container-host">ok</span>
      <span data-testid="sheet-state">{String(sheetOpen)}</span>
      <button type="button" onClick={() => setSheetOpen(true)}>
        open-sheet
      </button>
      <button type="button" onClick={() => setOptOutOpen(true)}>
        open-optout
      </button>
      <BottomSheet
        open={sheetOpen}
        onClose={() => {
          arbitrationOrder.push("sheet");
          setSheetOpen(false);
        }}
      >
        content
      </BottomSheet>
      <BottomSheet
        open={optOutOpen}
        backDismiss={false}
        onClose={() => {
          arbitrationOrder.push("optout");
          setOptOutOpen(false);
        }}
      >
        content
      </BottomSheet>
    </div>
  );
}

function ConfirmHostPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  return (
    <div>
      <span data-testid="confirm-host">ok</span>
      <button type="button" onClick={() => setConfirmOpen(true)}>
        open-confirm
      </button>
      <MobileConfirmDialog
        open={confirmOpen}
        title="确认"
        onCancel={() => {
          setCancelled(true);
          setConfirmOpen(false);
        }}
        onConfirm={() => setConfirmOpen(false)}
      />
      <span data-testid="confirm-cancelled">{String(cancelled)}</span>
    </div>
  );
}

type Controller = {
  render: () => void;
  cleanup: () => void;
};

function mountApp(): Controller {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      <RouterProvider rootKey="home">
        <PageHost rootContent={<div data-testid="root">ROOT</div>} />
        <OverlayHost />
      </RouterProvider>
    );
  });
  return {
    render: () => {
      act(() => {
        root.render(
          <RouterProvider rootKey="home">
            <PageHost rootContent={<div data-testid="root">ROOT</div>} />
            <OverlayHost />
          </RouterProvider>
        );
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

// jsdom 中 motion 退出动画按真实时间播放，用条件轮询等待最终状态
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor 超时");
    }
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  }
}

describe("router 集成", () => {
  beforeEach(() => {
    events.length = 0;
    clearPageMetasForTest();
    clearPageDefinitionsForTest();
    registerPages();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("初始渲染根页", () => {
    const app = mountApp();
    expect(document.querySelector('[data-testid="root"]')?.textContent).toBe("ROOT");
    app.cleanup();
  });

  it("push 渲染新页，返回后弹出且根页保留", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 7 });
    });
    expect(document.querySelector('[data-testid="params"]')?.textContent).toBe("7");
    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector('[data-testid="params"]') === null);
    expect(document.querySelector('[data-testid="root"]')).toBeTruthy();
    app.cleanup();
  });

  it("keep-alive：页面被覆盖后输入状态保留，返回时恢复", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 1 });
    });
    const input = document.querySelector('input[aria-label="draft"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "草稿A");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      getNavigator().push("todoDetail", { todoId: 2 });
    });
    const deeperInput = document.querySelector(
      '[data-page-active="true"] input[aria-label="draft"]'
    ) as HTMLInputElement;
    expect(deeperInput).not.toBe(input);
    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(
      () => document.querySelector('[data-page-active="true"] input[aria-label="draft"]') === input
    );
    expect(input.value).toBe("草稿A");
    app.cleanup();
  });

  it("match:multi 每次 push 新实例", () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 1 });
    });
    act(() => {
      getNavigator().push("todoDetail", { todoId: 1 });
    });
    const entries = document.querySelectorAll('[data-page-key="todoDetail"]');
    expect(entries.length).toBeGreaterThanOrEqual(2);
    app.cleanup();
  });

  it("生命周期事件：进入与被覆盖时触发 pause/resume", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 5 });
    });
    expect(events).toContain("init");
    await waitFor(() => events.includes("enter"));

    act(() => {
      getNavigator().push("todoDetail", { todoId: 6 });
    });
    // 覆盖下层页面 → pause
    await waitFor(() => events.includes("pause"));

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => events.includes("resume"));
    await waitFor(() => events.includes("destroy"));
    app.cleanup();
  });

  it("pushForResult + finish 返回结果", async () => {
    const app = mountApp();
    let settled: { picked: number } | null = null;
    let rejected: unknown = null;
    const promise = getNavigator()
      .pushForResult<{ picked: number }>("cardPicker", {})
      .then(value => {
        settled = value;
      })
      .catch(error => {
        rejected = error;
      });

    act(() => {
      getNavigator().push("todoDetail", { todoId: 3 });
    });
    expect(document.querySelector("[data-overlay-entry-id]")).toBeTruthy();

    act(() => {
      const pickButton = document.querySelector(
        "[data-overlay-entry-id] button"
      ) as HTMLButtonElement;
      pickButton.click();
    });
    await waitFor(() => settled !== null);
    await promise;
    expect(settled).toEqual({ picked: 42 });
    expect(rejected).toBeNull();
    app.cleanup();
  });

  it("popstate 恢复：浏览器返回等同 navigator.goBack", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 9 });
    });
    window.history.back();
    await waitFor(() => document.querySelector('[data-testid="params"]') === null);
    expect(document.querySelector('[data-testid="root"]')).toBeTruthy();
    app.cleanup();
  });
});

describe("返回仲裁（浮层优先）", () => {
  beforeEach(() => {
    clearPageMetasForTest();
    clearPageDefinitionsForTest();
    registerPages();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function readFlag(testId: string): string {
    return document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
  }

  it("overlay 打开时返回仅关闭 overlay，screen 栈不动；再返回才弹页面", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 7 });
    });
    act(() => {
      getNavigator().push("cardPicker", {});
    });
    expect(document.querySelector("[data-overlay-entry-id]")).toBeTruthy();

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector("[data-overlay-entry-id]") === null);
    expect(document.querySelector('[data-testid="params"]')?.textContent).toBe("7");

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector('[data-testid="params"]') === null);
    expect(document.querySelector('[data-testid="root"]')).toBeTruthy();
    app.cleanup();
  });

  it("popstate（系统返回手势）同样先关 overlay", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 7 });
    });
    act(() => {
      getNavigator().push("cardPicker", {});
    });
    window.history.back();
    await waitFor(() => document.querySelector("[data-overlay-entry-id]") === null);
    expect(document.querySelector('[data-testid="params"]')?.textContent).toBe("7");
    app.cleanup();
  });

  it("useSheetBackDismiss：本地 Sheet 打开时返回只关 Sheet，页面保留", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("sheetHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-a
    });
    expect(readFlag("sheet-a")).toBe("true");

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("sheet-a") === "false");
    // 页面未被弹栈
    expect(document.querySelector('[data-testid="sheet-a"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="root"]')).toBeTruthy();

    // 排空首次返回的防抖微任务窗口后再发起第二次返回（同 LIFO 用例）
    await act(async () => {
      await Promise.resolve();
    });

    // Sheet 关闭后再返回 → 正常弹页面
    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector('[data-testid="sheet-a"]') === null);
    app.cleanup();
  });

  it("多 Sheet 叠加按 LIFO 消费：后声明的先关，逐次返回逐层退", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("sheetHost", {});
    });
    const buttons = document.querySelectorAll("button");
    act(() => {
      (buttons[0] as HTMLButtonElement).click(); // open-a
    });
    act(() => {
      (buttons[1] as HTMLButtonElement).click(); // open-b
    });
    expect(readFlag("sheet-a")).toBe("true");
    expect(readFlag("sheet-b")).toBe("true");

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("sheet-b") === "false");
    expect(readFlag("sheet-a")).toBe("true");

    // 返回防抖以微任务窗口计：真实用户两次手势间隔宏任务，测试需排空微任务
    // 让首次 historyBack 的 inFlight 复位后再发起第二次返回
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("sheet-a") === "false");
    expect(document.querySelector('[data-testid="sheet-a"]')).toBeTruthy();
    app.cleanup();
  });

  it("overlay 优先于下层 screen 的本地 Sheet 消费返回", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("sheetHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-a
    });
    act(() => {
      getNavigator().push("cardPicker", {});
    });

    act(() => {
      getNavigator().goBack("ui");
    });
    // overlay 关闭，下层 screen 的本地 Sheet 不受影响
    await waitFor(() => document.querySelector("[data-overlay-entry-id]") === null);
    expect(readFlag("sheet-a")).toBe("true");
    app.cleanup();
  });
});

describe("容器组件内置返回拦截", () => {
  beforeEach(() => {
    arbitrationOrder.length = 0;
    clearPageMetasForTest();
    clearPageDefinitionsForTest();
    registerPages();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function readFlag(testId: string): string {
    return document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
  }

  it("BottomSheet 默认拦截：返回只关面板，页面保留", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("containerHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-sheet
    });
    expect(readFlag("sheet-state")).toBe("true");

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("sheet-state") === "false");
    expect(document.querySelector('[data-testid="container-host"]')).toBeTruthy();
    // sheet 消费（返回 true）后仲裁即止，页面级 handler 不再被问
    expect(arbitrationOrder).toEqual(["sheet"]);
    app.cleanup();
  });

  it("backDismiss={false} 透传：返回不调 onClose，正常弹页面栈", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("containerHost", {});
    });
    const buttons = document.querySelectorAll("button");
    act(() => {
      (buttons[1] as HTMLButtonElement).click(); // open-optout
    });

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector('[data-testid="container-host"]') === null);
    expect(arbitrationOrder).toEqual(["page"]); // 容器未注册拦截，只问页面级
    // 等待 portal 退出动画排空，避免与 root.unmount 竞态
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    app.cleanup();
  });

  it("MobileConfirmDialog：返回等同取消", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("confirmHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-confirm
    });

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("confirm-cancelled") === "true");
    expect(document.querySelector('[data-testid="confirm-host"]')).toBeTruthy();
    app.cleanup();
  });
});
