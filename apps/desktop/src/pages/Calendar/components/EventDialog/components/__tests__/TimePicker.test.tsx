import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimePicker from "../TimePicker";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

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
    if (originalScrollIntoView) {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
    vi.restoreAllMocks();
  });

  it("打开面板时应滚动到当前选中的小时和分钟", async () => {
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewMock as typeof HTMLElement.prototype.scrollIntoView;

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

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
    expect(scrollIntoViewMock).toHaveBeenNthCalledWith(1, {
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoViewMock).toHaveBeenNthCalledWith(2, {
      block: "nearest",
      inline: "nearest",
    });
    expect(
      (scrollIntoViewMock.mock.instances[0] as HTMLElement).textContent?.trim(),
    ).toBe("18");
    expect(
      (scrollIntoViewMock.mock.instances[1] as HTMLElement).textContent?.trim(),
    ).toBe("45");

    await unmount(root, container);
  });

  it("外部 value 更新后应滚动到新的已选小时和分钟", async () => {
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView =
      scrollIntoViewMock as typeof HTMLElement.prototype.scrollIntoView;

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

    scrollIntoViewMock.mockClear();

    await act(async () => {
      root.render(
        <TimePicker value="10:30" onChange={vi.fn()} label="开始时间" />,
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
    expect(scrollIntoViewMock).toHaveBeenNthCalledWith(1, {
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoViewMock).toHaveBeenNthCalledWith(2, {
      block: "nearest",
      inline: "nearest",
    });
    expect(
      (scrollIntoViewMock.mock.instances[0] as HTMLElement).textContent?.trim(),
    ).toBe("10");
    expect(
      (scrollIntoViewMock.mock.instances[1] as HTMLElement).textContent?.trim(),
    ).toBe("30");

    await unmount(root, container);
  });
});
