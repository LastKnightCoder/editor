import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OverlayHost,
  PageHost,
  RouterProvider,
  definePage,
  getNavigator,
  usePage,
  usePageLifecycle,
  paramNumber,
} from "../index";
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
