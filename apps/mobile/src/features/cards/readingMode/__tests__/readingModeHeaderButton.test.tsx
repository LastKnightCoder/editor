import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "../../../../components/PageHeader";
import { ReadingModeHeaderButton } from "../ReadingModeHeaderButton";

describe("ReadingModeHeaderButton", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = "";
  });

  function render(props: { editing: boolean; canEdit: boolean }, onCover = false) {
    const onEnter = vi.fn();
    const onExit = vi.fn();
    const button = <ReadingModeHeaderButton {...props} onEnter={onEnter} onExit={onExit} />;
    act(() => {
      root.render(onCover ? <PageHeader transparent actions={button} /> : button);
    });
    return { onEnter, onExit };
  }

  it("不可编辑时不渲染", () => {
    render({ editing: false, canEdit: false });
    expect(host.querySelector("button")).toBeNull();
  });

  it("阅读态显示「编辑」胶囊，点击进入编辑", () => {
    const { onEnter, onExit } = render({ editing: false, canEdit: true });
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="编辑"]');
    expect(button?.className).toContain("bg-accent-soft");
    act(() => button?.click());
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("编辑态显示「完成」，按下不抢焦点，点击退出编辑", () => {
    const { onEnter, onExit } = render({ editing: true, canEdit: true });
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("完成");
    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    act(() => {
      button?.dispatchEvent(pointerDown);
    });
    expect(pointerDown.defaultPrevented).toBe(true);
    act(() => button?.click());
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("封面顶栏上使用半透明白底", () => {
    render({ editing: false, canEdit: true }, true);
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="编辑"]');
    expect(button?.className).toContain("bg-white/20");
    expect(button?.querySelector(".cover-icon-fade-white")).not.toBeNull();
  });
});
