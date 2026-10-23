import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const backHandlers = vi.hoisted(() => [] as Array<{ open: boolean; dismiss: () => void }>);
vi.mock("../../../../router/useSheetBackDismiss", () => ({
  useSheetBackDismiss: (open: boolean, dismiss: () => void) => {
    backHandlers.push({ open, dismiss });
  },
}));

import { useBlockSelection, type BlockSelectionState } from "../useBlockSelection";

type HarnessProps = {
  blockCount: number;
  editing?: boolean;
  disabled?: boolean;
  exitEditing?: () => void;
};

describe("useBlockSelection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let state: BlockSelectionState;

  function Harness(props: HarnessProps) {
    state = useBlockSelection({
      blockCount: props.blockCount,
      editing: props.editing ?? false,
      exitEditing: props.exitEditing ?? (() => {}),
      disabled: props.disabled,
    });
    return null;
  }

  const render = (props: HarnessProps) => {
    act(() => {
      root.render(<Harness {...props} />);
    });
  };

  beforeEach(() => {
    backHandlers.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("enter 选中该块并激活；编辑态先退出编辑", () => {
    const exitEditing = vi.fn();
    render({ blockCount: 4, editing: true, exitEditing });
    act(() => state.enter(2));
    expect(exitEditing).toHaveBeenCalledTimes(1);
    expect(state.active).toBe(true);
    expect(state.selected).toEqual([2]);
  });

  it("阅读态 enter 不调用 exitEditing", () => {
    const exitEditing = vi.fn();
    render({ blockCount: 4, exitEditing });
    act(() => state.enter(0));
    expect(exitEditing).not.toHaveBeenCalled();
    expect(state.active).toBe(true);
  });

  it("enter 不传下标时激活并选中 0 个块", () => {
    render({ blockCount: 3 });
    act(() => state.enter());
    expect(state.active).toBe(true);
    expect(state.selected).toEqual([]);
  });

  it("toggle 加选并保持升序，再次 toggle 取消", () => {
    render({ blockCount: 5 });
    act(() => state.enter(3));
    act(() => state.toggle(1));
    expect(state.selected).toEqual([1, 3]);
    act(() => state.toggle(3));
    expect(state.selected).toEqual([1]);
  });

  it("selectAll 选中全部，setSelected 去重排序", () => {
    render({ blockCount: 3 });
    act(() => state.enter(0));
    act(() => state.selectAll());
    expect(state.selected).toEqual([0, 1, 2]);
    act(() => state.setSelected([2, 0, 2]));
    expect(state.selected).toEqual([0, 2]);
  });

  it("exit 退出并清空", () => {
    render({ blockCount: 3 });
    act(() => state.enter(1));
    act(() => state.exit());
    expect(state.active).toBe(false);
    expect(state.selected).toEqual([]);
  });

  it("块数减少时裁剪越界下标", () => {
    render({ blockCount: 5 });
    act(() => state.enter(0));
    act(() => state.setSelected([1, 3, 4]));
    render({ blockCount: 3 });
    expect(state.selected).toEqual([1]);
  });

  it("激活期间返回 = 退出", () => {
    render({ blockCount: 3 });
    expect(backHandlers.at(-1)?.open).toBe(false);
    act(() => state.enter(1));
    const latest = backHandlers.at(-1);
    expect(latest?.open).toBe(true);
    act(() => latest?.dismiss());
    expect(state.active).toBe(false);
    expect(backHandlers.at(-1)?.open).toBe(false);
  });

  it("不可编辑时不可进入，激活中变为不可编辑立即退出", () => {
    render({ blockCount: 3, disabled: true });
    act(() => state.enter(1));
    expect(state.active).toBe(false);

    render({ blockCount: 3 });
    act(() => state.enter(1));
    expect(state.active).toBe(true);
    render({ blockCount: 3, disabled: true });
    expect(state.active).toBe(false);
  });
});
