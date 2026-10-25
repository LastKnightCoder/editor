import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhiteBoardContentView } from "../WhiteBoardContentView";

const state = vi.hoisted(() => ({
  id: 11,
  save: vi.fn(),
  replace: vi.fn(),
  owner: null as { id: number } | null,
}));
vi.mock("@/page/PageProvider", () => ({
  usePageParams: () => ({ id: state.id }),
  usePageBreadcrumb: vi.fn(),
  usePage: () => ({
    navigator: {
      current: () => ({ key: "whiteboard-content", params: { id: state.id } }),
      replace: state.replace,
    },
  }),
}));
vi.mock("../../queries", () => ({
  useWhiteboardOwner: () => ({ owner: state.owner, loading: false }),
  useWhiteBoardContent: (id: number) => ({
    data: { id, name: `白板 ${id}`, data: { children: [], selection: [], viewPort: {} } },
    save: {
      mutateAsync: (...args: unknown[]) => {
        state.save(...args);
        return Promise.resolve();
      },
    },
  }),
}));
vi.mock("@/features/shared/whiteboard/DesktopWhiteboard", () => ({
  default: ({ onChange, readonly }: { onChange?: (data: unknown) => void; readonly?: boolean }) => (
    <button disabled={readonly} onClick={() => onChange?.({ children: ["已编辑"] })}>
      编辑
    </button>
  ),
}));

let root: Root | undefined;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("单页画布", () => {
  it("页属于某块白板时原位换成白板详情并定位到这一页", () => {
    state.id = 21;
    state.owner = { id: 5 };
    host = document.createElement("div");
    root = createRoot(host);
    act(() => root!.render(<WhiteBoardContentView />));
    expect(state.replace).toHaveBeenCalledWith("whiteboard-detail", { id: 5, page: 21 });
    expect(host.querySelector("button")).toBeNull();
    state.owner = null;
  });
});

describe("白板详情保存", () => {
  it("旧快照只读，切换页面与卸载都不写回原快照，转换只由用户显式发起", () => {
    vi.useFakeTimers();
    state.id = 11;
    host = document.createElement("div");
    root = createRoot(host);
    const canvas = () =>
      [...host.querySelectorAll("button")].find(button => button.textContent === "编辑")!;
    act(() => root!.render(<WhiteBoardContentView />));
    expect(host.textContent).toContain("转换格式");
    expect(canvas().disabled).toBe(true);
    act(() => canvas().click());
    expect(state.save).not.toHaveBeenCalled();
    state.id = 12;
    act(() => root!.render(<WhiteBoardContentView />));
    expect(state.save).not.toHaveBeenCalled();
    expect(canvas().disabled).toBe(true);
    act(() => canvas().click());
    act(() => root!.unmount());
    root = undefined;
    expect(state.save).not.toHaveBeenCalled();
  });
});
