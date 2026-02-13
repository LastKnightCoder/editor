import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OptionBottomSheet,
  type OptionBottomSheetProps,
} from "../OptionBottomSheet";

type SheetController = {
  render: (props: OptionBottomSheetProps) => Promise<void>;
  cleanup: () => Promise<void>;
};

function createSheetController(): SheetController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: async (props) => {
      await act(async () => {
        root.render(<OptionBottomSheet {...props} />);
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

function createBaseProps(): OptionBottomSheetProps {
  return {
    open: true,
    title: "选择仓库",
    value: "",
    options: [
      { label: "repo-a", value: "repo-a" },
      { label: "repo-b", value: "repo-b" },
    ],
    onClose: vi.fn(),
    onSelect: vi.fn(),
  };
}

describe("OptionBottomSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("open/close 时按动画生命周期渲染", async () => {
    vi.useFakeTimers();
    const controller = createSheetController();
    const props = createBaseProps();

    await controller.render(props);
    expect(document.body.textContent?.includes("选择仓库")).toBe(true);

    await controller.render({ ...props, open: false });
    expect(document.body.textContent?.includes("选择仓库")).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(document.body.textContent?.includes("选择仓库")).toBe(false);
    await controller.cleanup();
  });

  it("点击选项会触发 onSelect 与 onClose", async () => {
    const controller = createSheetController();
    const props = createBaseProps();
    await controller.render(props);

    const optionButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("repo-a"),
    );
    expect(optionButton).toBeTruthy();
    optionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(props.onSelect).toHaveBeenCalledWith("repo-a");
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await controller.cleanup();
  });

  it("支持 loading 与空状态文案", async () => {
    const controller = createSheetController();
    const props = createBaseProps();
    await controller.render({
      ...props,
      loading: true,
      options: [],
    });
    expect(document.body.textContent?.includes("加载中...")).toBe(true);

    await controller.render({
      ...props,
      loading: false,
      options: [],
      emptyText: "暂无仓库",
    });
    expect(document.body.textContent?.includes("暂无仓库")).toBe(true);
    await controller.cleanup();
  });
});
