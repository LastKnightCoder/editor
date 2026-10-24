import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionSheet, type ActionSheetItem } from "../ActionSheet";

/**
 * 退场动画完成时机在 jsdom 里不可复现：面板位移的 exit 目标是百分比，
 * 而拖拽后 y 是像素数字，jsdom 无布局换算不出，motion 会直接跳到目标——
 * 于是"退场动画瞬时完成"与"动画要播 300ms"两种结果随用例时序漂移，
 * 导致"退场期间面板仍在、onClose 未回调"的断言单跑必失败、全量偶尔失败。
 * 这里只把 AnimatePresence 换成受控替身（保留真实 motion 值与 animate 回弹），
 * 让退场完成时机由测试掌握，组件自身的时序契约照常被验证。
 */
const EXIT_MS = 100;
vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  const { useEffect, useRef, useState } = await import("react");

  function ControlledAnimatePresence({
    children,
    onExitComplete,
  }: {
    children?: React.ReactNode;
    onExitComplete?: () => void;
  }) {
    const hasChildren = Boolean(children);
    // 退场期间继续渲染最后一次的子树（真实 AnimatePresence 也这么留住面板）
    const latestRef = useRef(children);
    if (hasChildren) latestRef.current = children;
    const [unmounted, setUnmounted] = useState(!hasChildren);
    const exitCompleteRef = useRef(onExitComplete);
    exitCompleteRef.current = onExitComplete;

    useEffect(() => {
      if (hasChildren) {
        setUnmounted(false);
        return;
      }
      if (unmounted) return;
      const timer = setTimeout(() => {
        setUnmounted(true);
        exitCompleteRef.current?.();
      }, EXIT_MS);
      return () => clearTimeout(timer);
    }, [hasChildren, unmounted]);

    return unmounted ? null : latestRef.current;
  }

  return { ...actual, AnimatePresence: ControlledAnimatePresence };
});

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

describe("ActionSheet 单选当前项", () => {
  it("selected 项尾部显示 CheckBubble，其余项不显示", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <ActionSheet
          open
          title="打开文档时"
          items={[
            { label: "阅读模式", selected: true, onClick: vi.fn() },
            { label: "直接编辑", selected: false, onClick: vi.fn() },
          ]}
          onClose={vi.fn()}
        />
      );
    });

    const checks = document.querySelectorAll('[aria-label="当前选中"]');
    expect(checks).toHaveLength(1);
    expect(checks[0].getAttribute("class")).toContain("bg-accent");
    const selectedButton = checks[0].closest("button");
    expect(selectedButton?.textContent).toContain("阅读模式");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
