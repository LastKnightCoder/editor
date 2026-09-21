/**
 * 实例级 params 注入单测（PageParamsProvider / usePageParams）：
 * PageHost 按栈条目注入 params，多个 params 实例保活时各实例读到**自己的** params——
 * 回归守护「从全局栈顶取 params」的串台缺陷（隐藏实例读到栈顶实例的 id，
 * 曾引发 contentId 漂移与错误落盘）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { definePage } from "../definePage";
import { PageProvider, usePage, usePageParams, type Navigator } from "../PageProvider";
import { PageHost } from "../PageHost";
import { paramNumber, createPageSchema } from "../core/paramsSchema";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 实例探针：显示自己的 params.id（修复前显示全局栈顶的 id，两实例会同值） */
function ParamsProbe() {
  const { id } = usePageParams<{ id: number }>();
  return <span data-testid={`probe-${id}`}>id={id}</span>;
}

const schema = createPageSchema({ id: paramNumber() });
definePage({
  key: "params-test",
  match: "params",
  getId: params => `params-test-${params.id}`,
  params: schema.schema,
  label: "参数页",
  component: ParamsProbe,
});

/** 把 navigator 桥出来供测试驱动栈（render 期赋值，随重渲染刷新） */
function NavBridge({ apiRef }: { apiRef: { current: Navigator | null } }) {
  apiRef.current = usePage().navigator;
  return null;
}

let root: Root | undefined;
let host: HTMLDivElement;
const api: { current: Navigator | null } = { current: null };

function renderHarness() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <PageProvider initialKey="params-test" initialParams={{ id: 1 }}>
        <NavBridge apiRef={api} />
        <PageHostHarness />
      </PageProvider>
    );
  });
}

/** PageHost 需要 state prop，从 context 桥接 */
function PageHostHarness() {
  const { state } = usePage();
  return <PageHost state={state} />;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

describe("usePageParams（实例级注入）", () => {
  it("多实例保活时各实例读自己的 params：隐藏实例不随栈顶漂移", async () => {
    renderHarness();
    expect(host.querySelector('[data-testid="probe-1"]')!.textContent).toBe("id=1");

    await act(async () => {
      api.current!.push("params-test", { id: 2 });
    });
    // A(id=1) 实例被隐藏但仍在树中，且仍显示 1（不是栈顶的 2）
    expect(host.querySelector('[data-testid="probe-1"]')!.textContent).toBe("id=1");
    expect(host.querySelector('[data-testid="probe-2"]')!.textContent).toBe("id=2");

    await act(async () => {
      api.current!.back();
    });
    // 回到 A 实例：params 未漂移（修复前 back 后 A 实例已渲染成 2）
    expect(host.querySelector('[data-testid="probe-1"]')!.textContent).toBe("id=1");
    expect(host.querySelector('[data-testid="probe-2"]')).toBeNull();
  });

  it("栈顶同参去重与异参原位更新经实例注入保持正确", async () => {
    renderHarness();

    await act(async () => {
      api.current!.push("params-test", { id: 2 });
    });
    await act(async () => {
      api.current!.push("params-test", { id: 2 }); // 同参 no-op
    });
    expect(host.querySelectorAll("span[data-testid]").length).toBe(2);

    await act(async () => {
      api.current!.push("params-test", { id: 3 }); // 栈顶异参 → 原位更新
    });
    expect(host.querySelector('[data-testid="probe-2"]')!.textContent).toBe("id=2");
    expect(host.querySelector('[data-testid="probe-3"]')!.textContent).toBe("id=3");
  });
});
