import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEdgeFade, useEdgeFadeX } from "../useScrollState";

// jsdom 无布局也不带这两个 Observer，stub 成空实现
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
class MutationObserverStub {
  observe() {}
  disconnect() {}
}

function ScrollProbe(props: { bottom?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFade(ref, { bottom: props.bottom });
  return <div ref={ref} />;
}

function setScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number }
) {
  Object.defineProperty(el, "scrollHeight", { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: metrics.clientHeight, configurable: true });
}

function scrollTo(el: HTMLElement, scrollTop: number) {
  el.scrollTop = scrollTop;
  el.dispatchEvent(new Event("scroll"));
}

function ScrollXProbe() {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFadeX(ref);
  return <div ref={ref} />;
}

/** 首帧不渲染滚动容器（模拟加载态早退分支），show 翻真后容器才出现 */
function LateProbe(props: { show: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEdgeFade(ref);
  return props.show ? <div ref={ref} /> : <span />;
}

function setScrollXMetrics(el: HTMLElement, metrics: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(el, "scrollWidth", { value: metrics.scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: metrics.clientWidth, configurable: true });
}

function scrollXTo(el: HTMLElement, scrollLeft: number) {
  el.scrollLeft = scrollLeft;
  el.dispatchEvent(new Event("scroll"));
}

describe("useScrollState / useEdgeFade", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("MutationObserver", MutationObserverStub);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("内容不足一屏：上下渐隐均不启用", async () => {
    await act(async () => {
      root.render(<ScrollProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 300, clientHeight: 500 });

    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("0");
  });

  it("能滚但贴顶：仅底部渐隐启用", async () => {
    await act(async () => {
      root.render(<ScrollProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 500 });

    await act(async () => {
      scrollTo(el, 0);
    });
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("1");
  });

  it("滚动中：上下渐隐均启用；滚到底：底部渐隐收起", async () => {
    await act(async () => {
      root.render(<ScrollProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 500 });

    await act(async () => {
      scrollTo(el, 100);
    });
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("1");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("1");

    await act(async () => {
      scrollTo(el, 500);
    });
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("1");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("0");
  });

  it("bottom: false（无 Dock 的二级页）：底部渐隐恒不启用", async () => {
    await act(async () => {
      root.render(<ScrollProbe bottom={false} />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 500 });

    await act(async () => {
      scrollTo(el, 100);
    });
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("1");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("0");
  });

  it("横向：内容不溢出时两端渐隐均不启用", async () => {
    await act(async () => {
      root.render(<ScrollXProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollXMetrics(el, { scrollWidth: 300, clientWidth: 400 });

    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
    expect(el.style.getPropertyValue("--edge-x-start-on")).toBe("0");
    expect(el.style.getPropertyValue("--edge-x-end-on")).toBe("0");
  });

  it("横向：溢出但贴左端时仅右端渐隐启用", async () => {
    await act(async () => {
      root.render(<ScrollXProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollXMetrics(el, { scrollWidth: 800, clientWidth: 400 });

    await act(async () => {
      scrollXTo(el, 0);
    });
    expect(el.style.getPropertyValue("--edge-x-start-on")).toBe("0");
    expect(el.style.getPropertyValue("--edge-x-end-on")).toBe("1");
  });

  it("横向：滚动中两端渐隐均启用，滚到最右端收起右端", async () => {
    await act(async () => {
      root.render(<ScrollXProbe />);
    });
    const el = host.firstElementChild as HTMLDivElement;
    setScrollXMetrics(el, { scrollWidth: 800, clientWidth: 400 });

    await act(async () => {
      scrollXTo(el, 100);
    });
    expect(el.style.getPropertyValue("--edge-x-start-on")).toBe("1");
    expect(el.style.getPropertyValue("--edge-x-end-on")).toBe("1");

    await act(async () => {
      scrollXTo(el, 400);
    });
    expect(el.style.getPropertyValue("--edge-x-start-on")).toBe("1");
    expect(el.style.getPropertyValue("--edge-x-end-on")).toBe("0");
  });

  it("滚动容器晚于首次渲染出现（加载态早退分支）：元素到位后仍接管", async () => {
    await act(async () => {
      root.render(<LateProbe show={false} />);
    });
    expect(host.querySelector("div")).toBeNull();

    await act(async () => {
      root.render(<LateProbe show />);
    });
    const el = host.querySelector("div") as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 1000, clientHeight: 500 });
    await act(async () => {
      scrollTo(el, 0);
    });
    // 元素到位后才挂上的监听也要生效：贴顶时只开底部带
    expect(el.style.getPropertyValue("--edge-top-on")).toBe("0");
    expect(el.style.getPropertyValue("--edge-bottom-on")).toBe("1");
  });
});
