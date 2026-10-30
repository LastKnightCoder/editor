import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DICTATION_LIMIT_MS,
  DictationOverlay,
  type DictationOverlayProps,
} from "../DictationOverlay";

describe("DictationOverlay", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (props: Partial<DictationOverlayProps> = {}) => {
    act(() => {
      root.render(
        <DictationOverlay open connecting={false} startedAt={null} cancelArmed={false} {...props} />
      );
    });
  };
  const overlay = () => document.querySelector<HTMLElement>("[data-dictation-overlay]");

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("open=false 不渲染", () => {
    render({ open: false });
    expect(overlay()).toBeNull();
  });

  it("沉浸区使用锁定的键盘高度，不额外叠加工具栏高度", () => {
    render({ panelHeight: 312 });
    const panel = overlay()?.querySelector<HTMLElement>(".dictation-zone");
    expect(panel?.style.height).toBe("312px");
  });

  it("连接中显示「正在连接…」", () => {
    render({ connecting: true });
    expect(overlay()?.textContent).toContain("正在连接…");
  });

  it("默认提示「松手插入 · 上滑取消」，计时从 0:00 起", () => {
    render();
    expect(overlay()?.textContent).toContain("松手插入 · 上滑取消");
    expect(overlay()?.textContent).toContain("0:00");
    expect(overlay()?.hasAttribute("data-cancel-armed")).toBe(false);
  });

  it("取消态提示「松手取消」并带 data-cancel-armed", () => {
    render({ cancelArmed: true, polishEnabled: true });
    expect(overlay()?.textContent).toContain("松手取消");
    expect(overlay()?.textContent).not.toContain("上滑取消");
    expect(overlay()?.hasAttribute("data-cancel-armed")).toBe(true);
  });

  it("配置润色时提示「松手后 AI 润色」", () => {
    render({ polishEnabled: true });
    expect(overlay()?.textContent).toContain("松手后 AI 润色 · 上滑取消");
  });

  it("阅读态追加时提示「松手追加到文末」", () => {
    render({ appendToEnd: true });
    expect(overlay()?.textContent).toContain("松手追加到文末 · 上滑取消");
  });

  it("剩余不超过 15 秒时计时变红", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    render({ startedAt: Date.now() - 106_000 });
    const timer = Array.from(overlay()!.querySelectorAll("span")).find(span =>
      span.textContent?.includes("1:46")
    );
    expect(timer?.className).toContain("text-danger");
    expect(DICTATION_LIMIT_MS - 106_000).toBeLessThanOrEqual(15_000);
  });

  it("剩余时间充足时计时不变红", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
    render({ startedAt: Date.now() - 30_000 });
    const timer = Array.from(overlay()!.querySelectorAll("span")).find(span =>
      span.textContent?.includes("0:30")
    );
    expect(timer).toBeTruthy();
    expect(timer?.className).not.toContain("text-danger");
  });

  it("渲染到指定 portalContainer", () => {
    const portal = document.createElement("div");
    document.body.appendChild(portal);
    render({ portalContainer: portal });
    expect(portal.querySelector("[data-dictation-overlay]")).toBeTruthy();
  });
});
