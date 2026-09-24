import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhiteBoardContentView } from "../WhiteBoardContentView";

const state = vi.hoisted(() => ({ id: 11, save: vi.fn() }));
vi.mock("@/page/PageProvider", () => ({
  usePageParams: () => ({ id: state.id }),
  usePageBreadcrumb: vi.fn(),
}));
vi.mock("../../queries", () => ({
  useWhiteBoardContent: (id: number) => ({
    data: { id, name: `白板 ${id}`, data: { children: [], selection: [], viewPort: {} } },
    save: { mutate: state.save },
  }),
}));
vi.mock("@/components/WhiteBoard", () => ({
  default: ({ onChange }: { onChange: (data: unknown) => void }) => (
    <button onClick={() => onChange({ children: ["已编辑"] })}>编辑</button>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("白板详情保存", () => {
  it("离页前提交防抖中的最后一次修改，切换 ID 不写入另一块白板", () => {
    vi.useFakeTimers();
    state.id = 11;
    host = document.createElement("div");
    root = createRoot(host);
    act(() => root!.render(<WhiteBoardContentView />));
    act(() => host.querySelector("button")!.click());
    expect(state.save).not.toHaveBeenCalled();
    state.id = 12;
    act(() => root!.render(<WhiteBoardContentView />));
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, data: { children: ["已编辑"] } })
    );
    act(() => host.querySelector("button")!.click());
    act(() => root!.unmount());
    root = undefined;
    expect(state.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 12 }));
    expect(state.save).toHaveBeenCalledTimes(2);
  });
});
