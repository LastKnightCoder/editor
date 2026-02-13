import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useRootScrollLock } from "../useRootScrollLock";

function LockHarness(props: { locked: boolean }) {
  useRootScrollLock(props.locked);
  return null;
}

type LockController = {
  render: (locked: boolean) => void;
  cleanup: () => void;
};

function createLockController(): LockController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: (locked) => {
      act(() => {
        root.render(<LockHarness locked={locked} />);
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("navigation/useRootScrollLock", () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (jsdom)",
    });
    document.documentElement.classList.remove("mobile-root-scroll-locked");
    document.body.classList.remove("mobile-root-scroll-locked");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.innerHTML = "";
  });

  it("locked=true 时应给 html/body 添加滚动锁 class，解除时恢复", () => {
    const controller = createLockController();

    controller.render(false);
    expect(
      document.documentElement.classList.contains("mobile-root-scroll-locked"),
    ).toBe(false);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      false,
    );

    controller.render(true);
    expect(
      document.documentElement.classList.contains("mobile-root-scroll-locked"),
    ).toBe(true);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      true,
    );

    controller.render(false);
    expect(
      document.documentElement.classList.contains("mobile-root-scroll-locked"),
    ).toBe(false);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      false,
    );

    controller.cleanup();
  });

  it("组件卸载时应自动清理滚动锁 class", () => {
    const controller = createLockController();
    controller.render(true);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      true,
    );

    controller.cleanup();

    expect(
      document.documentElement.classList.contains("mobile-root-scroll-locked"),
    ).toBe(false);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      false,
    );
  });

  it("Android 下应避免使用 body fixed，降低键盘与视口冲突风险", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Linux; Android 14)",
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: () => {},
    });
    const controller = createLockController();

    controller.render(true);
    expect(
      document.documentElement.classList.contains("mobile-root-scroll-locked"),
    ).toBe(true);
    expect(document.body.classList.contains("mobile-root-scroll-locked")).toBe(
      true,
    );
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");

    controller.cleanup();
  });

  it("不应覆盖 body/html 的 inline overflow，避免干扰其它滚动锁", () => {
    const controller = createLockController();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    controller.render(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    controller.render(false);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    controller.cleanup();
  });
});
