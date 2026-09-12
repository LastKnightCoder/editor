// 回归测试：quickCapture 关闭链路。曾因 backHandler 无条件 return true 且内嵌 goBack，
// 与 router「handler 返回 true = 已消费不弹栈」的语义互喂成死循环：浮层永远关不掉、
// refreshCards 无限重放、IPC 风暴直至卡死（2026-09-10 真机复现）。
// 测试用真实 RouterProvider + 真实页面定义驱动，仅 mock 闪念抽屉视图层与 Tauri IPC。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import quickCaptureDefinition from "../quickCapture.page";
import {
  definePage,
  getNavigator,
  OverlayHost,
  registerPageDefinition,
  RouterProvider,
} from "../../../../router";
import { clearPageDefinitionsForTest } from "../../../../router/registry";
import { clearPageMetasForTest, registerPageMeta } from "../../../../router/core/pageMeta";

// vi.mock 工厂执行早于模块体求值，共享常量必须定义在工厂内部（否则 TDZ 报错被吞，浮层渲染失败）
vi.mock("../../QuickCaptureSheet", () => {
  const NON_EMPTY_CONTENT = [
    { type: "paragraph", children: [{ type: "formatted", text: "hello" }] },
  ];
  return {
    QuickCaptureSheet: (props: {
      saving: boolean;
      onContentChange?: (content: unknown[]) => void;
      onRequestClose: (content: unknown[]) => void;
    }) => (
      <div data-testid="qc-sheet">
        <button
          type="button"
          data-testid="qc-type"
          onClick={() => props.onContentChange?.(NON_EMPTY_CONTENT)}
        >
          type
        </button>
        <button
          type="button"
          data-testid="qc-close"
          disabled={props.saving}
          onClick={() => props.onRequestClose(NON_EMPTY_CONTENT)}
        >
          close
        </button>
      </div>
    ),
  };
});

const tauriMocks = vi.hoisted(() => ({
  createTemporaryCard: vi.fn(async () => ({ id: 101, contentId: 201 })),
  updateContent: vi.fn(async () => ({})),
  updateCardCategory: vi.fn(async () => ({})),
  deleteCard: vi.fn(async () => 1),
  getCardDetail: vi.fn(async () => ({ id: 101, contentId: 201 })),
}));

const appMocks = vi.hoisted(() => ({
  presentError: vi.fn(),
  refreshCardsSafe: vi.fn(async () => null),
}));

vi.mock("../../../../services/tauri", () => tauriMocks);
vi.mock("../../../../app/AppContext", () => ({
  useAppContext: () => ({
    presentError: appMocks.presentError,
    refreshCardsSafe: appMocks.refreshCardsSafe,
  }),
}));

const testHomeDefinition = definePage({
  key: "qc-test-home",
  layer: "screen",
  params: {},
  component: () => <div data-testid="qc-home" />,
});

let root: Root | null = null;

function renderUi(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <RouterProvider rootKey="qc-test-home">
        <OverlayHost />
      </RouterProvider>
    );
  });
}

function queryTestid(testid: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testid}"]`);
}

async function until(condition: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`等待超时: ${what}`);
}

async function openQuickCapture(): Promise<void> {
  // OverlayHost 按 createdAt 严格大于根页判定激活；同毫秒 push 会被判 hidden，
  // <Activity> hidden 且从未激活时不挂载 DOM——真实使用间隔秒级不会踩到
  await new Promise(resolve => setTimeout(resolve, 5));
  // 同步 act 内 push：act 退出时即完成浮层首渲染，后续轮询无需依赖异步 flush 时序
  act(() => {
    getNavigator().push("quickCapture");
  });
  await act(async () => {
    await until(() => queryTestid("qc-close") !== null, "quickCapture 浮层渲染");
  });
}

async function typeContent(): Promise<void> {
  act(() => {
    queryTestid("qc-type")!.click();
  });
}

async function closeAndAwaitGone(trigger: () => void): Promise<void> {
  await act(async () => {
    trigger();
    await until(() => queryTestid("qc-close") === null, "浮层弹栈");
  });
}

beforeEach(() => {
  // 抹掉当前历史条目上的旧栈快照，避免 Provider 挂载时把上个用例的栈恢复出来
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.clearAllMocks();
  clearPageMetasForTest();
  clearPageDefinitionsForTest();
  registerPageMeta(quickCaptureDefinition.meta);
  registerPageDefinition(quickCaptureDefinition);
  registerPageMeta(testHomeDefinition.meta);
  registerPageDefinition(testHomeDefinition);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
});

describe("quickCapture 关闭链路", () => {
  it("点 X 关闭：落库一次并弹栈，刷新不重放（防死循环回归）", async () => {
    renderUi();
    await openQuickCapture();
    await typeContent();
    await closeAndAwaitGone(() => queryTestid("qc-close")!.click());
    expect(queryTestid("qc-sheet")).toBeNull();
    expect(tauriMocks.createTemporaryCard).toHaveBeenCalledTimes(1);
    expect(appMocks.refreshCardsSafe).toHaveBeenCalledTimes(1);
  });

  it("系统返回键：同样先落库再弹栈", async () => {
    renderUi();
    await openQuickCapture();
    await typeContent();
    await closeAndAwaitGone(() => {
      void getNavigator().goBack("android");
    });
    expect(queryTestid("qc-sheet")).toBeNull();
    expect(tauriMocks.createTemporaryCard).toHaveBeenCalledTimes(1);
    expect(appMocks.refreshCardsSafe).toHaveBeenCalledTimes(1);
  });

  it("落库失败：浮层保留并提示错误，不弹栈", async () => {
    tauriMocks.createTemporaryCard.mockRejectedValueOnce(new Error("db locked"));
    renderUi();
    await openQuickCapture();
    await typeContent();
    await act(async () => {
      queryTestid("qc-close")!.click();
      await until(() => appMocks.presentError.mock.calls.length > 0, "保存失败提示");
    });
    expect(queryTestid("qc-close")).not.toBeNull();
    expect(appMocks.refreshCardsSafe).not.toHaveBeenCalled();
  });

  it("关闭连击：只落库一次（in-flight 互斥）", async () => {
    renderUi();
    await openQuickCapture();
    await typeContent();
    await act(async () => {
      const closeBtn = queryTestid("qc-close") as HTMLButtonElement;
      closeBtn.click();
      closeBtn.click();
      await until(() => queryTestid("qc-close") === null, "浮层弹栈");
    });
    expect(tauriMocks.createTemporaryCard).toHaveBeenCalledTimes(1);
    expect(appMocks.refreshCardsSafe).toHaveBeenCalledTimes(1);
  });
});
