import { Activity, act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  placeholder: "用自己的话写下「x」这个思路" as string | null,
  settle: vi.fn(),
  watch: vi.fn(),
}));
vi.mock("@/services/pattern-card", () => ({
  patternCardPlaceholderOf: () => mocks.placeholder,
  settlePatternCard: mocks.settle,
  watchPatternCard: mocks.watch,
}));

import { usePatternCardDraft } from "../usePatternCardDraft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Detail({ cardId }: { cardId: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draft = usePatternCardDraft(cardId, rootRef);
  return <div ref={rootRef}>{draft.placeholder}</div>;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.placeholder = "用自己的话写下「x」这个思路";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("usePatternCardDraft", () => {
  it("保活隐藏不结算，真正关闭才结算", () => {
    const render = (visible: boolean) =>
      act(() =>
        root.render(
          <Activity mode={visible ? "visible" : "hidden"}>
            <Detail cardId={7} />
          </Activity>
        )
      );
    render(true);
    expect(container.textContent).toContain("这个思路");
    expect(mocks.watch).toHaveBeenCalledWith(7, expect.any(Function));
    // 编辑器还没就绪时按空读
    expect(mocks.watch.mock.calls[0][1]()).toBe(true);

    render(false);
    expect(mocks.settle).not.toHaveBeenCalled();
    render(true);
    // 隐藏时 effect 确实清理过、再显示时重新登记
    expect(mocks.watch).toHaveBeenCalledTimes(2);
    act(() => root.render(<></>));
    expect(mocks.settle).toHaveBeenCalledWith(7);
  });

  it("不是草稿时什么都不做", () => {
    mocks.placeholder = null;
    act(() => root.render(<Detail cardId={8} />));
    act(() => root.render(<></>));
    expect(mocks.watch).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
