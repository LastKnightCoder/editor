/**
 * Esc 浮层仲裁单测（useOverlayDismiss，D-003）：
 * 浮层激活时 Esc 先关最上层（LIFO）、优先于编辑上下文；无浮层时 Esc 无操作
 * （Esc=后退已于 2026-09-20 用户裁决移除，后退归 Alt+←/→ 与标题栏按钮）。
 * 浮层注销后恢复「无浮层 → 后退」语义。
 * 契约注记：注册表只仲裁优先级，dismiss 后的注销由浮层自身状态驱动
 * （dismiss → open=false → effect cleanup），探针以 selfClose 忠实模拟。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definePage } from "../definePage";
import { PageProvider, useOverlayDismiss, usePage, type Navigator } from "../PageProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Noop = () => null;
definePage({ key: "esc-test-a", params: {}, component: Noop, label: "A" });
definePage({ key: "esc-test-b", params: {}, component: Noop, label: "B" });

interface OverlaySpec {
  name: string;
  /** 外部 controlled 开度（active=false 即注销，模拟业务态关闭） */
  active?: boolean;
  /** dismiss 后自注销（模拟真实浮层 dismiss → open=false → cleanup） */
  selfClose?: boolean;
}

/** 浮层探针（渲染输入框模拟浮层内容承载焦点） */
function OverlayProbe({
  name,
  active: externalActive = true,
  selfClose = false,
  onDismiss,
}: OverlaySpec & { onDismiss: (name: string) => void }) {
  const [alive, setAlive] = useState(true);
  const active = externalActive && alive;
  useOverlayDismiss(() => {
    onDismiss(name);
    if (selfClose) setAlive(false);
  }, active);
  return <input data-testid={`overlay-${name}`} />;
}

/** 把 navigator 桥出来供栈态断言（render 期赋值，随重渲染刷新） */
function NavBridge({ apiRef }: { apiRef: { current: Navigator | null } }) {
  apiRef.current = usePage().navigator;
  return null;
}

function Harness({
  overlays,
  onDismiss,
  apiRef,
}: {
  overlays: OverlaySpec[];
  onDismiss: (name: string) => void;
  apiRef: { current: Navigator | null };
}) {
  return (
    <PageProvider initialKey="esc-test-a">
      <NavBridge apiRef={apiRef} />
      {overlays.map(o => (
        <OverlayProbe key={o.name} {...o} onDismiss={onDismiss} />
      ))}
    </PageProvider>
  );
}

const escapeEvent = () =>
  new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });

/** 在 target 上按 Esc；返回 defaultPrevented（true=被浮层消费） */
const pressEsc = (target: EventTarget | HTMLElement = window): boolean => {
  const evt = escapeEvent();
  act(() => {
    target.dispatchEvent(evt);
  });
  return evt.defaultPrevented;
};

describe("Esc 浮层仲裁（useOverlayDismiss，D-003）", () => {
  let container: HTMLDivElement;
  let root: Root;
  let dismissed: string[];
  let apiRef: { current: Navigator | null };

  beforeEach(() => {
    dismissed = [];
    apiRef = { current: null };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderHarness = (overlays: OverlaySpec[], onDismiss?: (name: string) => void) =>
    act(() => {
      root.render(
        <Harness
          overlays={overlays}
          onDismiss={onDismiss ?? (n => dismissed.push(n))}
          apiRef={apiRef}
        />
      );
    });
  const currentKey = () => apiRef.current!.current()?.key;

  it("浮层激活时 Esc 逐层关最上层（LIFO），全关后 Esc 无操作（不后退）", () => {
    renderHarness([
      { name: "bottom", selfClose: true },
      { name: "top", selfClose: true },
    ]);
    act(() => apiRef.current!.push("esc-test-b"));
    expect(currentKey()).toBe("esc-test-b");

    expect(pressEsc()).toBe(true);
    expect(dismissed).toEqual(["top"]);
    expect(currentKey()).toBe("esc-test-b");

    expect(pressEsc()).toBe(true);
    expect(dismissed).toEqual(["top", "bottom"]);
    expect(currentKey()).toBe("esc-test-b");

    pressEsc();
    expect(dismissed).toEqual(["top", "bottom"]);
    expect(currentKey()).toBe("esc-test-b");
  });

  it("active=false 的浮层不注册退场回调，Esc 无操作", () => {
    renderHarness([{ name: "x", active: false }]);
    act(() => apiRef.current!.push("esc-test-b"));

    pressEsc();
    expect(dismissed).toEqual([]);
    expect(currentKey()).toBe("esc-test-b");
  });

  it("浮层注销（active 转 false）后不再消费 Esc", () => {
    renderHarness([{ name: "x" }]);
    act(() => apiRef.current!.push("esc-test-b"));

    renderHarness([{ name: "x", active: false }]);
    pressEsc();
    expect(dismissed).toEqual([]);
    expect(currentKey()).toBe("esc-test-b");
  });

  it("焦点在浮层输入框（编辑上下文）时 Esc 仍关浮层而非让位", () => {
    renderHarness([{ name: "p", selfClose: true }]);
    act(() => apiRef.current!.push("esc-test-b"));

    const input = container.querySelector<HTMLInputElement>('input[data-testid="overlay-p"]')!;
    input.focus();
    expect(document.activeElement).toBe(input);

    expect(pressEsc(input)).toBe(true);
    expect(dismissed).toEqual(["p"]);
    expect(currentKey()).toBe("esc-test-b");
  });

  it("dismiss 闭包经 ref 保鲜：rerender 换回调后 Esc 调最新实现", () => {
    const calls: string[] = [];
    renderHarness([{ name: "x" }], () => calls.push("v1"));
    renderHarness([{ name: "x" }], () => calls.push("v2"));

    pressEsc();
    expect(calls).toEqual(["v2"]);
  });
});
