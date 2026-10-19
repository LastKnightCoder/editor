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
  paramNumber,
} from "../index";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import {
  EditorConfirmHost,
  EditorPromptHost,
  mobileEditorNotifier,
} from "../../services/editorNotifier";
import { clearPageDefinitionsForTest } from "../registry";
import { clearPageMetasForTest } from "../core/pageMeta";
import { MobileEditorOverlayDismiss } from "../../services/editorOverlayDismiss";
import { createEditorKit } from "@tau/editor";
import { IOverlayBackDismiss, OverlayBackDismiss } from "@tau/editor/api";
import { EditorKitScope } from "../../../../../packages/editor/src/core/kit/context";

const overlayKit = createEditorKit({
  services: [register => register(IOverlayBackDismiss, { Layer: MobileEditorOverlayDismiss })],
});

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

function HandledPickerPage() {
  const { navigator } = usePage();
  useBackHandler(() => true);
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
  return (
    <div>
      <EditorKitScope kit={overlayKit}>
        <OverlayBackDismiss open={sheetAOpen} onDismiss={() => setSheetAOpen(false)} />
        <OverlayBackDismiss open={sheetBOpen} onDismiss={() => setSheetBOpen(false)} />
      </EditorKitScope>
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
    key: "handledPicker",
    layer: "overlay",
    params: {},
    component: HandledPickerPage,
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
  definePage({
    key: "editorConfirmHost",
    params: {},
    component: EditorConfirmHostPage,
  });
  definePage({
    key: "editorPromptHost",
    params: {},
    component: EditorPromptHostPage,
  });
}

// 编辑器经 IEditorNotifier 发起的确认（webview 删除等）：返回手势同样先关确认框
function EditorConfirmHostPage() {
  const [result, setResult] = useState("pending");
  return (
    <div data-testid="editor-confirm-host">
      <button
        type="button"
        onClick={() => {
          void mobileEditorNotifier
            .confirm({ title: "确认删除", confirmText: "删除", danger: true })
            .then(confirmed => setResult(String(confirmed)));
        }}
      >
        open-editor-confirm
      </button>
      <EditorConfirmHost />
      <span data-testid="editor-confirm-result">{result}</span>
    </div>
  );
}

// 编辑器经 IEditorNotifier.prompt 发起的输入（插入网络图片 / 视频 / 音频地址）：返回手势先关输入面板
function EditorPromptHostPage() {
  const [result, setResult] = useState("pending");
  return (
    <div data-testid="editor-prompt-host">
      <button
        type="button"
        onClick={() => {
          void mobileEditorNotifier
            .prompt({ title: "插入网络图片", confirmText: "插入" })
            .then(value => setResult(String(value)));
        }}
      >
        open-editor-prompt
      </button>
      <EditorPromptHost />
      <span data-testid="editor-prompt-result">{result}</span>
    </div>
  );
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

const mountedApps: Controller[] = [];

function mountApp(onRootBackHint?: (text: string) => void): Controller {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      <RouterProvider rootKey="home" onRootBackHint={onRootBackHint}>
        <PageHost rootContent={<div data-testid="root">ROOT</div>} />
        <OverlayHost />
      </RouterProvider>
    );
  });
  let cleaned = false;
  const controller: Controller = {
    render: () => {
      act(() => {
        root.render(
          <RouterProvider rootKey="home" onRootBackHint={onRootBackHint}>
            <PageHost rootContent={<div data-testid="root">ROOT</div>} />
            <OverlayHost />
          </RouterProvider>
        );
      });
    },
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
  mountedApps.push(controller);
  return controller;
}

function cleanupMountedApps(): void {
  const apps = mountedApps.splice(0);
  for (const app of apps) {
    app.cleanup();
  }
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
    cleanupMountedApps();
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
    let promise!: Promise<void>;
    act(() => {
      promise = getNavigator()
        .pushForResult<{ picked: number }>("cardPicker", {})
        .then(value => {
          settled = value;
        })
        .catch(error => {
          rejected = error;
        });
    });

    // overlay 必须仍是栈顶：finish 按 createdAt 选择真正顶部 entry。
    // 再压一层更新的 screen 会盖住 overlay，finish 会弹错层，结果通道永不结算。
    await waitFor(() => document.querySelector("[data-overlay-entry-id] button") !== null);

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

  it("finish 不被页面返回拦截器吞掉", async () => {
    const app = mountApp();
    let settled: { picked: number } | null = null;
    let promise!: Promise<void>;
    act(() => {
      promise = getNavigator()
        .pushForResult<{ picked: number }>("handledPicker", {})
        .then(value => {
          settled = value;
        });
    });

    await waitFor(() => document.querySelector("[data-overlay-entry-id] button") !== null);
    act(() => {
      const pickButton = document.querySelector(
        "[data-overlay-entry-id] button"
      ) as HTMLButtonElement;
      pickButton.click();
    });
    await waitFor(() => settled !== null);
    await promise;
    expect(settled).toEqual({ picked: 42 });
    await waitFor(() => document.querySelector("[data-overlay-entry-id]") === null);
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
    cleanupMountedApps();
    document.body.innerHTML = "";
  });

  function readFlag(testId: string): string {
    return document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
  }

  it("根页本地浮层按 LIFO 消费 Android 返回，关闭后才提示退出", async () => {
    const hints: string[] = [];
    const app = mountApp(text => hints.push(text));
    const navigator = getNavigator();
    const rootId = navigator.getActiveScreen()!.id;
    const open = [true, true];
    const closed: number[] = [];
    const unregister = open.map((_, index) =>
      navigator.registerBackHandler(rootId, () => {
        if (!open[index]) return false;
        open[index] = false;
        closed.push(index);
        return true;
      })
    );
    await act(async () => {
      await navigator.goBack("android");
    });
    expect(closed).toEqual([1]);
    expect(hints).toHaveLength(0);
    await act(async () => {
      await navigator.goBack("android");
    });
    expect(closed).toEqual([1, 0]);
    expect(hints).toHaveLength(0);
    await act(async () => {
      await navigator.goBack("android");
    });
    expect(hints).toHaveLength(1);
    expect(navigator.getScreenStack().entries).toHaveLength(1);
    unregister.forEach(remove => remove());
    app.cleanup();
  });

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

  it("编辑器浮层适配：本地 Sheet 打开时返回只关 Sheet，页面保留", async () => {
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
    cleanupMountedApps();
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

  it("编辑器确认（IEditorNotifier）：返回等同取消，页面保留", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("editorConfirmHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-editor-confirm
    });
    expect(document.body.textContent).toContain("确认删除");

    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => readFlag("editor-confirm-result") === "false");
    expect(document.querySelector('[data-testid="editor-confirm-host"]')).toBeTruthy();
    // 等待确认框退出动画排空，避免与 root.unmount 竞态
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 250));
    });
    app.cleanup();
  });

  it("编辑器输入（IEditorNotifier.prompt）：返回等同取消，页面保留", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("editorPromptHost", {});
    });
    act(() => {
      (document.querySelector("button") as HTMLButtonElement).click(); // open-editor-prompt
    });
    expect(document.body.textContent).toContain("插入网络图片");

    act(() => {
      getNavigator().goBack("ui");
    });
    // BottomSheet 先播退场动画再回调 onClose → 按取消结算
    await waitFor(() => readFlag("editor-prompt-result") === "null");
    expect(document.querySelector('[data-testid="editor-prompt-host"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain("插入网络图片");

    // 输入面板关掉后，下一次返回才弹页面
    act(() => {
      getNavigator().goBack("ui");
    });
    await waitFor(() => document.querySelector('[data-testid="editor-prompt-host"]') === null);
    app.cleanup();
  });
});
