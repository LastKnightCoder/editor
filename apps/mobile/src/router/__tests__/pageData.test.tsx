import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PageHost,
  PageQueryProvider,
  RouterProvider,
  definePage,
  getNavigator,
  getQueryClient,
  usePage,
  usePageLifecycle,
  usePageQuery,
  usePageStore,
  usePageStoreSetter,
  paramNumber,
} from "../index";
import { clearPageDefinitionsForTest } from "../registry";
import { clearPageMetasForTest } from "../core/pageMeta";

let loadCalls = 0;
const loadDetail = async (params: { todoId: number }) => {
  loadCalls += 1;
  return { title: `任务#${params.todoId}` };
};

function TodoDetailPage() {
  const { params } = usePage<{ todoId: number }>();
  const detail = usePageQuery<{ title: string }>("detail");
  const draft = usePageStore(s => s.draft as string);
  const setState = usePageStoreSetter();
  usePageLifecycle({});
  return (
    <div>
      <span data-testid="title">{detail.data?.title ?? "loading"}</span>
      <span data-testid="load-calls">{detail.fetchStatus}</span>
      <input
        aria-label="page-store-draft"
        value={draft}
        onChange={e => setState({ draft: e.target.value })}
        data-testid="todo-id"
        data-todo-id={params.todoId}
      />
    </div>
  );
}

function registerPages() {
  definePage({
    key: "home",
    params: {},
    component: () => <div>ROOT</div>,
  });
  definePage({
    key: "todoDetail",
    match: "multi",
    params: { todoId: paramNumber() },
    data: {
      detail: {
        key: p => ["todo", p.todoId],
        load: p => loadDetail(p as { todoId: number }),
        refetchOnResume: "always",
        staleTime: 999_999,
      },
    },
    store: p => ({ draft: `d${(p as { todoId: number }).todoId}` }),
    component: TodoDetailPage,
  });
}

function mountApp(): { cleanup: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      <PageQueryProvider>
        <RouterProvider rootKey="home">
          <PageHost rootContent={<div>ROOT</div>} />
        </RouterProvider>
      </PageQueryProvider>
    );
  });
  return {
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await act(async () => {
      await new Promise(r => setTimeout(r, 25));
    });
  }
}

describe("router 页面数据层", () => {
  beforeEach(() => {
    loadCalls = 0;
    clearPageMetasForTest();
    clearPageDefinitionsForTest();
    registerPages();
    window.history.replaceState(null, "");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("usePageQuery 按 params 加载数据，usePageStore 可读写", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 3 });
    });
    await waitFor(() => document.querySelector('[data-testid="title"]')?.textContent === "任务#3");
    const input = document.querySelector(
      'input[aria-label="page-store-draft"]'
    ) as HTMLInputElement;
    expect(input.value).toBe("d3");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "改过的草稿");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      (document.querySelector('input[aria-label="page-store-draft"]') as HTMLInputElement).value
    ).toBe("改过的草稿");
    expect(loadCalls).toBe(1);
    app.cleanup();
  });

  it("同 params 重复 push 命中缓存不重取；返回时按 always 重取", async () => {
    const app = mountApp();
    act(() => {
      getNavigator().push("todoDetail", { todoId: 5 });
    });
    await waitFor(
      () =>
        document.querySelector('[data-page-active="true"] [data-testid="title"]')?.textContent ===
        "任务#5"
    );
    expect(loadCalls).toBe(1);

    act(() => {
      getNavigator().push("todoDetail", { todoId: 6 });
    });
    await waitFor(
      () =>
        document.querySelector('[data-page-active="true"] [data-testid="title"]')?.textContent ===
        "任务#6"
    );
    act(() => {
      getNavigator().goBack("ui");
    });
    // 回到 5：缓存秒显 + always refetch
    await waitFor(
      () =>
        document.querySelector('[data-page-active="true"] [data-testid="title"]')?.textContent ===
        "任务#5"
    );
    await waitFor(() => loadCalls >= 3);
    expect(loadCalls).toBeGreaterThanOrEqual(3);
    app.cleanup();
  });
});

describe("navigator.preload 预取", () => {
  beforeEach(() => {
    loadCalls = 0;
    clearPageMetasForTest();
    clearPageDefinitionsForTest();
    registerPages();
    window.history.replaceState(null, "");
    getQueryClient().clear();
  });

  it("preload 预取 query 缓存，随后 push 同参数页面不再发起请求", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        <PageQueryProvider>
          <RouterProvider rootKey="home">
            <PageHost rootContent={<div>ROOT</div>} />
          </RouterProvider>
        </PageQueryProvider>
      );
    });
    await act(async () => {
      await getNavigator().preload("todoDetail", { todoId: 11 });
    });
    act(() => {
      getNavigator().push("todoDetail", { todoId: 11 });
    });
    await waitFor(
      () =>
        document.querySelector('[data-page-active="true"] [data-testid="title"]')?.textContent ===
        "任务#11"
    );
    expect(loadCalls).toBe(1);
    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
