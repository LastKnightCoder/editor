import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { hookResult, setHookResult } = vi.hoisted(() => ({
  hookResult: { current: undefined as Record<string, unknown> | undefined },
  setHookResult: (value: Record<string, unknown> | undefined) => {
    hookResult.current = value;
  },
}));

vi.mock("@tau/shared", () => ({
  useEditDatabaseWithContext: (_tableId?: number) => hookResult.current,
}));
vi.mock("@/components/Database", () => ({
  default: (props: Record<string, unknown>) => <div data-database={String(props.activeViewId)} />,
}));
vi.mock("@tau/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/ui")>()),
  EditText: ({
    defaultValue,
    onPressEnter,
  }: {
    defaultValue: string;
    onPressEnter: () => void;
  }) => (
    <input
      data-testid="title-input"
      defaultValue={defaultValue}
      onKeyDown={e => {
        if (e.key === "Enter") onPressEnter();
      }}
    />
  ),
}));

import DatabaseWorkspace, { type DatabaseWorkspaceProps } from "../DatabaseWorkspace";
import type { ComponentProps } from "react";

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  vi.clearAllMocks();
});

const makeHookResult = () => ({
  activeViewId: 3,
  views: [
    { id: 3, name: "表格视图" },
    { id: 4, name: "画廊视图" },
  ],
  table: { id: 9, columns: [], rows: [] },
  onDataChange: vi.fn(),
  onViewConfigChange: vi.fn(),
  onCreateView: vi.fn(),
  onDeleteView: vi.fn(),
  onRenameView: vi.fn(),
  onUpdateView: vi.fn(),
  onReorderViews: vi.fn(),
  onActiveViewIdChange: vi.fn(),
});

const render = (props: Partial<DatabaseWorkspaceProps>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<DatabaseWorkspace {...(props as ComponentProps<typeof DatabaseWorkspace>)} />);
  });
};

describe("DatabaseWorkspace（表格工作台共享骨架）", () => {
  it("表格数据就绪后渲染 Database 视图区", () => {
    setHookResult(makeHookResult() as never);
    render({
      tableId: 9,
      titleKey: 1,
      title: "表格",
      onTitleChange: vi.fn(),
      onTitleCommit: vi.fn(async () => {}),
    });
    expect(container.querySelector("[data-database='3']")).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("[data-testid='title-input']")?.defaultValue
    ).toBe("表格");
  });

  it("表格数据未就绪时不渲染任何内容", () => {
    setHookResult(undefined);
    render({
      titleKey: 1,
      title: "表格",
      onTitleChange: vi.fn(),
      onTitleCommit: vi.fn(async () => {}),
    });
    expect(container.innerHTML).toBe("");
  });

  it("标题回车触发 onTitleCommit", () => {
    setHookResult(makeHookResult() as never);
    const onTitleCommit = vi.fn(async () => {});
    render({ tableId: 9, titleKey: 1, title: "表格", onTitleChange: vi.fn(), onTitleCommit });
    const input = container.querySelector<HTMLInputElement>("[data-testid='title-input']")!;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onTitleCommit).toHaveBeenCalledOnce();
  });

  it("headerExtra 渲染在标题行", () => {
    setHookResult(makeHookResult() as never);
    render({
      tableId: 9,
      titleKey: 1,
      title: "表格",
      onTitleChange: vi.fn(),
      onTitleCommit: vi.fn(async () => {}),
      headerExtra: <button data-testid="switch-trigger">切换</button>,
    });
    expect(container.querySelector("[data-testid='switch-trigger']")).toBeTruthy();
  });
});
