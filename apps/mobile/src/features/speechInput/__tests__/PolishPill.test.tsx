import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolishPill, type PolishPillState } from "../PolishPill";

describe("PolishPill", () => {
  let host: HTMLDivElement;
  let root: Root;
  let actions: {
    onSkip: () => void;
    onToggleOriginal: () => void;
    onUndo: () => void;
    onRetry: () => void;
  };

  const render = (state: PolishPillState | null) => {
    act(() => root.render(<PolishPill state={state} {...actions} />));
  };
  const pill = () => document.querySelector<HTMLElement>("[data-polish-pill]");
  const click = (text: string) => {
    const button = Array.from(pill()?.querySelectorAll("button") ?? []).find(
      item => item.textContent === text
    );
    expect(button, text).toBeTruthy();
    act(() => button?.click());
  };

  beforeEach(() => {
    actions = { onSkip: vi.fn(), onToggleOriginal: vi.fn(), onUndo: vi.fn(), onRetry: vi.fn() };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("state=null 不渲染", () => {
    render(null);
    expect(pill()).toBeNull();
  });

  it("润色中：显示「AI 润色中」，跳过回调", () => {
    render({ kind: "polishing" });
    expect(pill()?.dataset.polishPill).toBe("polishing");
    expect(pill()?.textContent).toContain("AI 润色中");
    click("跳过");
    expect(actions.onSkip).toHaveBeenCalledTimes(1);
  });

  it("已润色：用原文切换、撤销", () => {
    render({ kind: "refined", showingOriginal: false });
    expect(pill()?.textContent).toContain("已润色");
    click("用原文");
    expect(actions.onToggleOriginal).toHaveBeenCalledTimes(1);
    click("撤销");
    expect(actions.onUndo).toHaveBeenCalledTimes(1);
  });

  it("已换回原文：用润色切回，无撤销按钮", () => {
    render({ kind: "refined", showingOriginal: true });
    expect(pill()?.textContent).toContain("已换回原文");
    expect(pill()?.textContent).not.toContain("撤销");
    click("用润色");
    expect(actions.onToggleOriginal).toHaveBeenCalledTimes(1);
  });

  it("失败：提示已用原文，重试回调", () => {
    render({ kind: "failed" });
    expect(pill()?.dataset.polishPill).toBe("failed");
    expect(pill()?.textContent).toContain("润色失败，已用原文");
    click("重试");
    expect(actions.onRetry).toHaveBeenCalledTimes(1);
    expect(actions.onSkip).not.toHaveBeenCalled();
  });
});
