import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionSheet, type ActionSheetItem } from "../ActionSheet";

function setup() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  return {
    render: async (open: boolean, onClose: () => void) => {
      const items: ActionSheetItem[] = [
        { label: "编辑", onClick: vi.fn() },
        { label: "删除", danger: true, onClick: vi.fn() },
      ];
      await act(async () => {
        root.render(<ActionSheet open={open} title="操作" items={items} onClose={onClose} />);
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function fireTouch(
  target: EventTarget,
  type: "touchstart" | "touchmove" | "touchend",
  clientY: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY, identifier: 1 }],
  });
  target.dispatchEvent(event);
}

function getPanel(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("div")).find(
      el => typeof el.className === "string" && el.className.includes("rounded-t-sheet")
    ) ?? null
  );
}

async function waitForInAct(predicate: () => boolean, timeoutMs = 3000) {
  await act(async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !predicate()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });
  expect(predicate()).toBe(true);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ActionSheet 下拉关闭与关闭缓冲", () => {
  it("从拖拽热区下拉超过阈值松手 → 退场动画完成后回调 onClose", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render(true, onClose);

    const zone = document.querySelector<HTMLElement>('[data-sheet-drag-zone="true"]');
    expect(zone).toBeTruthy();
    await act(async () => {
      fireTouch(zone!, "touchstart", 300);
      fireTouch(document, "touchmove", 400);
      fireTouch(document, "touchend", 400);
    });

    expect(onClose).not.toHaveBeenCalled();
    await waitForInAct(() => onClose.mock.calls.length === 1);
    expect(getPanel()).toBeFalsy();
    await cleanup();
  });

  it("点击取消按钮 → 退场动画完成后才回调 onClose，期间面板在场", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render(true, onClose);

    const cancelButton = Array.from(document.querySelectorAll("button")).find(
      button => button.textContent === "取消"
    );
    expect(cancelButton).toBeTruthy();
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 退场动画播放中：面板仍在，onClose 尚未回调
    expect(getPanel()).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await waitForInAct(() => onClose.mock.calls.length === 1);
    expect(getPanel()).toBeFalsy();
    await cleanup();
  });
});
