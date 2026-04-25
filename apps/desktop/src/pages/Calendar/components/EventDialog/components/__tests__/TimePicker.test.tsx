import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimePicker from "../TimePicker";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalScrollTo = HTMLElement.prototype.scrollTo;

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("TimePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    if (originalScrollTo) {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
    }
    vi.restoreAllMocks();
  });

  it("打开面板时应滚动到当前选中的小时和分钟", async () => {
    const scrollToMock = vi.fn();
    HTMLElement.prototype.scrollTo = scrollToMock;

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function mockClientHeight(this: HTMLElement) {
        return String(this.className).includes("overflow-y-auto") ? 160 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function mockOffsetHeight(this: HTMLElement) {
        if (
          this instanceof HTMLButtonElement &&
          /^\d{2}$/.test(this.textContent?.trim() ?? "")
        ) {
          return 28;
        }
        return 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function mockOffsetTop(this: HTMLElement) {
        if (!(this instanceof HTMLButtonElement)) {
          return 0;
        }

        const text = this.textContent?.trim() ?? "";
        if (!/^\d{2}$/.test(text)) {
          return 0;
        }

        return Number(text) * 28;
      },
    );

    const { root, container } = await mount(
      <TimePicker value="18:45" onChange={vi.fn()} label="开始时间" />,
    );

    const triggerButton = container.querySelector("button");
    expect(triggerButton).toBeTruthy();

    await act(async () => {
      triggerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      vi.runAllTimers();
    });

    expect(scrollToMock).toHaveBeenCalledTimes(2);
    expect(scrollToMock).toHaveBeenNthCalledWith(1, {
      top: 438,
      behavior: "smooth",
    });
    expect(scrollToMock).toHaveBeenNthCalledWith(2, {
      top: 1194,
      behavior: "smooth",
    });

    await unmount(root, container);
  });

  it("外部 value 更新后应滚动到新的已选小时和分钟", async () => {
    const scrollToMock = vi.fn();
    HTMLElement.prototype.scrollTo = scrollToMock;

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function mockClientHeight(this: HTMLElement) {
        return String(this.className).includes("overflow-y-auto") ? 160 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function mockOffsetHeight(this: HTMLElement) {
        if (
          this instanceof HTMLButtonElement &&
          /^\d{2}$/.test(this.textContent?.trim() ?? "")
        ) {
          return 28;
        }
        return 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function mockOffsetTop(this: HTMLElement) {
        if (!(this instanceof HTMLButtonElement)) {
          return 0;
        }

        const text = this.textContent?.trim() ?? "";
        if (!/^\d{2}$/.test(text)) {
          return 0;
        }

        return Number(text) * 28;
      },
    );

    const { root, container } = await mount(
      <TimePicker value="09:00" onChange={vi.fn()} label="开始时间" />,
    );

    const triggerButton = container.querySelector("button");
    expect(triggerButton).toBeTruthy();

    await act(async () => {
      triggerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      vi.runAllTimers();
    });

    scrollToMock.mockClear();

    await act(async () => {
      root.render(
        <TimePicker value="10:30" onChange={vi.fn()} label="开始时间" />,
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(scrollToMock).toHaveBeenCalledTimes(2);
    expect(scrollToMock).toHaveBeenNthCalledWith(1, {
      top: 214,
      behavior: "smooth",
    });
    expect(scrollToMock).toHaveBeenNthCalledWith(2, {
      top: 774,
      behavior: "smooth",
    });

    await unmount(root, container);
  });
});
