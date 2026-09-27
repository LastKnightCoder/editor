import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevFloatingBall } from "../DevFloatingBall";
import { listDevActions, registerDevAction } from "../registry";

const cleanups: Array<() => void> = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom 没有指针捕获
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  while (cleanups.length) cleanups.pop()!();
  localStorage.clear();
});

const pointer = (target: Element, type: string, x: number, y: number) =>
  act(() => {
    // jsdom 没有 PointerEvent 构造器，用 MouseEvent 带上 pointerId 就能走 React 的指针事件
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  });

const ballOf = () => document.querySelector<HTMLButtonElement>('button[aria-label="开发工具"]')!;

describe("开发操作注册表", () => {
  it("同 id 重复注册覆盖而不是出现两份（HMR 重新执行模块）", () => {
    cleanups.push(registerDevAction({ id: "a", group: "g", label: "旧", run: () => {} }));
    cleanups.push(registerDevAction({ id: "a", group: "g", label: "新", run: () => {} }));
    expect(
      listDevActions()
        .filter(a => a.id === "a")
        .map(a => a.label)
    ).toEqual(["新"]);
  });

  it("注销只删自己：被覆盖后旧的注销函数不影响新的", () => {
    const disposeOld = registerDevAction({ id: "b", group: "g", label: "旧", run: () => {} });
    cleanups.push(registerDevAction({ id: "b", group: "g", label: "新", run: () => {} }));
    disposeOld();
    expect(listDevActions().some(a => a.id === "b")).toBe(true);
  });
});

describe("DevFloatingBall", () => {
  it("点击展开，按分组列出操作，点操作执行它", async () => {
    const run = vi.fn(async () => "好了");
    cleanups.push(registerDevAction({ id: "t:run", group: "测试组", label: "跑一下", run }));
    act(() => root.render(<DevFloatingBall />));
    const ball = ballOf();
    pointer(ball, "pointerdown", 10, 10);
    pointer(ball, "pointerup", 10, 10);
    // Popover 随锚点就绪才挂载，多给一拍
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(document.body.textContent).toContain("测试组");
    const item = [...document.querySelectorAll("button")].find(b =>
      b.textContent?.includes("跑一下")
    )!;
    await act(async () => {
      item.click();
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("拖动不算点击，松手后位置记在本机", () => {
    act(() => root.render(<DevFloatingBall />));
    const ball = ballOf();
    pointer(ball, "pointerdown", 100, 100);
    pointer(ball, "pointermove", 60, 40);
    pointer(ball, "pointerup", 60, 40);
    expect(ball.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("tau:dev-floating-ball")).not.toBeNull();
  });
});
