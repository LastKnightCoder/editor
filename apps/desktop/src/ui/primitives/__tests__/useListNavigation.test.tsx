/**
 * useListNavigation 单测（Select / Menu 共用的导航交集，D-007）：
 * 环游移动（跳过 disabled / 无高亮起步 / 全 disabled 防御）· 边缘直达（目标
 * disabled 不落）· type-ahead 400ms 窗口（窗口内累积、过期清空）。
 * 项目无 testing-library：Probe 组件把 hook 句柄每渲染上报，行为与真实消费一致。
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useListNavigation } from "../useListNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type NavHandle = ReturnType<typeof useListNavigation<number>>;

interface ProbeProps {
  items: number[];
  disabled?: number[];
  initial?: number | null;
  onReady: (nav: NavHandle) => void;
}

function NavProbe({ items, disabled = [], initial = null, onReady }: ProbeProps) {
  const nav = useListNavigation<number>({
    items: () => items,
    isDisabled: i => disabled.includes(i),
    initial: () => initial,
  });
  onReady(nav);
  return null;
}

function renderProbe(props: Omit<ProbeProps, "onReady">) {
  let nav: NavHandle | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NavProbe {...props} onReady={n => (nav = n)} />));
  // 挂载时 current=null（initial 只在 reset 时生效——真实消费由 Surface 的 open effect 调用）
  act(() => (nav as NavHandle).reset());
  return {
    nav: () => nav as NavHandle,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useListNavigation", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
    vi.useRealTimers();
  });

  it("move：环游移动，两端回绕", () => {
    const h = renderProbe({ items: [0, 1, 2], initial: 0 });
    cleanups.push(h.cleanup);
    act(() => h.nav().move(1));
    expect(h.nav().current).toBe(1);
    act(() => h.nav().move(1));
    act(() => h.nav().move(1));
    expect(h.nav().current).toBe(0); // 2 → 0 回绕
    act(() => h.nav().move(-1));
    expect(h.nav().current).toBe(2); // 反向回绕
  });

  it("move：跳过 disabled；无高亮时按方向落首项", () => {
    const h = renderProbe({ items: [0, 1, 2], disabled: [1], initial: null });
    cleanups.push(h.cleanup);
    act(() => h.nav().move(1));
    expect(h.nav().current).toBe(0); // 无高亮起步落首项
    act(() => h.nav().move(1));
    expect(h.nav().current).toBe(2); // 跳过 1
  });

  it("move：全 disabled 不死循环、高亮不动", () => {
    const h = renderProbe({ items: [0, 1], disabled: [0, 1], initial: 0 });
    cleanups.push(h.cleanup);
    expect(() => act(() => h.nav().move(1))).not.toThrow();
    expect(h.nav().current).toBe(0);
  });

  it("edge：Home/End 直达；目标是 disabled 则不落", () => {
    const h = renderProbe({ items: [0, 1, 2], disabled: [2], initial: 1 });
    cleanups.push(h.cleanup);
    act(() => h.nav().edge("end"));
    expect(h.nav().current).toBe(1); // 末项 disabled，保持
    act(() => h.nav().edge("home"));
    expect(h.nav().current).toBe(0);
  });

  it("typeAhead：窗口内累积前缀命中；过期后缓冲清空", () => {
    vi.useFakeTimers();
    const h = renderProbe({ items: [0, 1, 2], initial: 0 });
    cleanups.push(h.cleanup);
    const find = (buf: string) => (buf === "ab" ? 2 : undefined);

    act(() => h.nav().typeAhead("a", find));
    expect(h.nav().current).toBe(0); // "a" 未命中，不动
    act(() => h.nav().typeAhead("b", find));
    expect(h.nav().current).toBe(2); // "ab" 命中

    act(() => {
      vi.advanceTimersByTime(401); // 窗口过期
    });
    act(() => h.nav().typeAhead("a", find));
    expect(h.nav().current).toBe(2); // 单独 "a" 仍不命中（缓冲已清，未拼成 "aa"）
  });

  it("reset：回到 initial 指定位", () => {
    const h = renderProbe({ items: [0, 1, 2], initial: 1 });
    cleanups.push(h.cleanup);
    act(() => h.nav().move(1));
    act(() => h.nav().reset());
    expect(h.nav().current).toBe(1);
  });
});
