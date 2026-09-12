import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomSheet, type BottomSheetProps } from "../BottomSheet";

function setup() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  return {
    render: async (props: BottomSheetProps) => {
      await act(async () => {
        root.render(<BottomSheet {...props} />);
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
      el => typeof el.className === "string" && el.className.includes("rounded-t-[30px]")
    ) ?? null
  );
}

function getDragZone(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-sheet-drag-zone="true"]');
}

function getMask(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".bg-mask");
}

/** 在 act 内轮询等待条件成立，动画完成帧触发的 setState 得以正确 flush */
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
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("BottomSheet 下拉关闭手势", () => {
  it("从拖拽热区下拉超过阈值松手 → 退场动画完成后回调 onClose", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({ open: true, title: "测试", onClose, children: <div>内容</div> });
    expect(getPanel()).toBeTruthy();

    const dragZone = getDragZone();
    expect(dragZone).toBeTruthy();
    await act(async () => {
      fireTouch(dragZone!, "touchstart", 300);
      // deltaY = 80px > 56px 阈值
      fireTouch(document, "touchmove", 380);
      expect(getPanel()?.style.transform).toContain("translateY");
      fireTouch(document, "touchend", 380);
    });

    // 关闭缓冲：onClose 延迟到退场动画完成后
    expect(onClose).not.toHaveBeenCalled();
    await waitForInAct(() => onClose.mock.calls.length === 1);
    expect(getPanel()).toBeFalsy();
    await cleanup();
  });

  it("下拉未达阈值松手 → 回弹且不关闭", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({ open: true, title: "测试", onClose, children: <div>内容</div> });

    fireTouch(getDragZone()!, "touchstart", 300);
    await act(async () => {
      // deltaY = 20px < 56px，速度也远低于阈值
      fireTouch(document, "touchmove", 320);
      fireTouch(document, "touchend", 320);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(getPanel()).toBeTruthy();
    await cleanup();
  });

  it("内容区滚动未到顶时，向下滑动让位原生滚动（不接管）", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({ open: true, title: "测试", onClose, children: <div>内容</div> });

    // 模拟内容已滚动：直接改写 contentRef 元素的 scrollTop
    const content = getPanel()?.querySelector<HTMLElement>('[data-allow-touchmove="true"]');
    expect(content).toBeTruthy();
    Object.defineProperty(content!, "scrollTop", { configurable: true, value: 200 });

    fireTouch(content!, "touchstart", 300);
    await act(async () => {
      fireTouch(document, "touchmove", 420);
      fireTouch(document, "touchend", 420);
    });

    expect(onClose).not.toHaveBeenCalled();
    await cleanup();
  });

  it("表单控件上的触摸不启动拖拽", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({
      open: true,
      onClose,
      children: <input type="text" placeholder="输入" />,
    });

    const input = document.querySelector("input")!;
    await act(async () => {
      fireTouch(input, "touchstart", 300);
      fireTouch(document, "touchmove", 420);
      fireTouch(document, "touchend", 420);
    });

    expect(onClose).not.toHaveBeenCalled();
    await cleanup();
  });
});

describe("BottomSheet 关闭缓冲与退出动画", () => {
  it("点击遮罩 → 先播退场动画（期间面板在场），动画完成后才回调 onClose", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({ open: true, title: "测试", onClose, children: <div>内容</div> });
    await waitForInAct(() => ["none", "", undefined].includes(getPanel()?.style.transform ?? ""));

    await act(async () => {
      getMask()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 退场动画播放中：面板与遮罩仍在，onClose 尚未回调
    expect(getPanel()).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await waitForInAct(() => onClose.mock.calls.length === 1);
    expect(getPanel()).toBeFalsy();
    await cleanup();
  });

  it("退场期间重复点击遮罩 → onClose 只回调一次", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    await render({ open: true, title: "测试", onClose, children: <div>内容</div> });
    await waitForInAct(() => ["none", "", undefined].includes(getPanel()?.style.transform ?? ""));

    await act(async () => {
      getMask()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      getMask()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForInAct(() => onClose.mock.calls.length === 1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await cleanup();
  });

  it("父级直接置 open=false（外部关闭）→ 播完退场动画卸载，不回调 onClose", async () => {
    const { render, cleanup } = setup();
    const props = { open: true, title: "测试", onClose: vi.fn(), children: <div>内容</div> };
    await render(props);
    await waitForInAct(() => ["none", "", undefined].includes(getPanel()?.style.transform ?? ""));

    await render({ ...props, open: false });
    // 旧实现 300ms 即强制卸载；新实现由 exit 完成回调驱动，320ms 时仍在退场
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 320));
    });
    expect(getPanel()).toBeTruthy();

    await waitForInAct(() => !getPanel());
    expect(props.onClose).not.toHaveBeenCalled();
    await cleanup();
  });

  it("拖拽关闭（onClose 后父级响应 open=false）再重开：面板从屏幕外重新滑入", async () => {
    const { render, cleanup } = setup();
    const onClose = vi.fn();
    const props = { open: true, title: "测试", onClose, children: <div>内容</div> };
    await render(props);
    await waitForInAct(() => ["none", "", undefined].includes(getPanel()?.style.transform ?? ""));

    // 拖拽 120px 松手 → 退场动画完成后 onClose 被调
    await act(async () => {
      fireTouch(getDragZone()!, "touchstart", 300);
      fireTouch(document, "touchmove", 420);
      fireTouch(document, "touchend", 420);
    });
    await waitForInAct(() => onClose.mock.calls.length === 1 && !getPanel());

    // 父级响应 onClose 置 open=false，随后重开
    await render({ ...props, open: false });
    await render(props);

    // 入场起点应在屏幕外（~100%），而非残留拖拽位置
    const transform = getPanel()?.style.transform ?? "";
    const matched = transform.match(/translateY\(([\d.]+)%\)/);
    expect(matched).toBeTruthy();
    expect(Number(matched![1])).toBeGreaterThan(30);
    await cleanup();
  });
});
