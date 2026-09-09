// 审查报告修复回归测试：popTo 深度（D-1）、replace 语义（D-2）、
// 存在级事件（D-3）、overlay createdAt 不变式（D-6，见 stackMachine.test）

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OverlayHost,
  PageHost,
  RouterProvider,
  definePage,
  getNavigator,
  usePageLifecycle,
} from "../index";
import { clearPageDefinitionsForTest } from "../registry";
import { clearPageMetasForTest } from "../core/pageMeta";

const events: string[] = [];

function ProbePage({ tag }: { tag: string }) {
  usePageLifecycle({
    onInit: () => events.push(`${tag}:init`),
    onDestroy: () => events.push(`${tag}:destroy`),
  });
  return <div data-page-tag={tag}>{tag}</div>;
}

function registerPages() {
  definePage({
    key: "home",
    params: {},
    component: () => <div>ROOT</div>,
  });
  for (const tag of ["a", "b", "c"]) {
    definePage({
      key: tag,
      match: "multi",
      params: {},
      component: () => <ProbePage tag={tag} />,
    });
  }
  definePage({
    key: "ox",
    layer: "overlay",
    match: "multi",
    params: {},
    component: () => <div>OVERLAY</div>,
  });
}

function stackKeys(): string {
  const screens = getNavigator()
    .getScreenStack()
    .entries.map(e => e.key)
    .join(",");
  const overlays = getNavigator()
    .getOverlayStack()
    .entries.map(e => e.key)
    .join(",");
  return `screens=[${screens}] overlays=[${overlays}]`;
}

type Controller = { cleanup: () => void };

function mountApp(): Controller {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      <RouterProvider rootKey="home">
        <PageHost rootContent={<div>ROOT</div>} />
        <OverlayHost />
      </RouterProvider>
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

async function waitFor(condition: () => boolean, timeoutMs = 2500): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor 超时: ${stackKeys()}`);
    }
    await act(async () => {
      await new Promise(r => setTimeout(r, 25));
    });
  }
}

describe("审查修复回归：popTo / replace / 生命周期", () => {
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

  it("D-1a: screen 目标 + 栈内 overlay，应连同 overlay 一起弹到目标", async () => {
    const app = mountApp();
    act(() => getNavigator().push("a"));
    act(() => getNavigator().push("b"));
    act(() => getNavigator().push("ox"));
    act(() => getNavigator().push("c"));
    await waitFor(() => stackKeys() === "screens=[home,a,b,c] overlays=[ox]");

    await act(async () => {
      getNavigator().popTo("a");
    });
    await waitFor(() => stackKeys() === "screens=[home,a] overlays=[]");
    app.cleanup();
  });

  it("D-1b: overlay 目标被更新 screen 盖住时，只弹掉其上的内容", async () => {
    const app = mountApp();
    act(() => getNavigator().push("a"));
    act(() => getNavigator().push("ox"));
    act(() => getNavigator().push("c"));
    await waitFor(() => stackKeys() === "screens=[home,a,c] overlays=[ox]");

    await act(async () => {
      getNavigator().popTo("ox");
    });
    // ox 之上的 c 应被弹掉，ox 保留且重新可见
    await waitFor(() => stackKeys() === "screens=[home,a] overlays=[ox]");
    const overlayNode = document.querySelector("[data-overlay-entry-id]");
    expect(overlayNode?.getAttribute("data-overlay-active")).toBe("true");
    app.cleanup();
  });

  it("D-1c: 目标即栈顶且被 overlay 盖住时，弹掉 overlay 露出目标", async () => {
    const app = mountApp();
    act(() => getNavigator().push("b"));
    act(() => getNavigator().push("ox"));
    await waitFor(() => stackKeys() === "screens=[home,b] overlays=[ox]");

    await act(async () => {
      getNavigator().popTo("b");
    });
    await waitFor(() => stackKeys() === "screens=[home,b] overlays=[]");
    app.cleanup();
  });

  it("D-1d: 目标不存在时不动作", async () => {
    const app = mountApp();
    act(() => getNavigator().push("a"));
    await waitFor(() => stackKeys() === "screens=[home,a] overlays=[]");

    await act(async () => {
      getNavigator().popTo("nonexistent");
    });
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });
    expect(stackKeys()).toBe("screens=[home,a] overlays=[]");
    app.cleanup();
  });

  it("D-2: replace 后返回应回到 replace 之前的上一页（被替换页不复活）", async () => {
    const app = mountApp();
    act(() => getNavigator().push("a"));
    await waitFor(() => stackKeys() === "screens=[home,a] overlays=[]");
    const lengthBefore = window.history.length;

    act(() => getNavigator().replace("b"));
    await waitFor(() => stackKeys() === "screens=[home,b] overlays=[]");
    expect(window.history.length).toBe(lengthBefore);

    await act(async () => {
      await getNavigator().goBack("ui");
    });
    await waitFor(() => stackKeys() === "screens=[home] overlays=[]");
    app.cleanup();
  });

  it("D-3: onDestroy 仅在 entry 离开栈时触发，压入第三层（hidden）不触发", async () => {
    const app = mountApp();
    act(() => getNavigator().push("a"));
    act(() => getNavigator().push("b"));
    await waitFor(() => stackKeys() === "screens=[home,a,b] overlays=[]");
    expect(events).toEqual(["a:init", "b:init"]);

    // push c：a 变 deeper（Activity hidden），不得触发 a:destroy
    act(() => getNavigator().push("c"));
    await waitFor(() => stackKeys() === "screens=[home,a,b,c] overlays=[]");
    await act(async () => {
      await new Promise(r => setTimeout(r, 80));
    });
    expect(events).toEqual(["a:init", "b:init", "c:init"]);

    // 弹掉 c：c 的 entry 离开栈 → c:destroy；a/b 不受影响
    await act(async () => {
      await getNavigator().goBack("ui");
    });
    await waitFor(() => stackKeys() === "screens=[home,a,b] overlays=[]");
    await waitFor(() => events.includes("c:destroy"));
    expect(events.filter(e => e.startsWith("a:"))).toEqual(["a:init"]);
    app.cleanup();
  });
});
