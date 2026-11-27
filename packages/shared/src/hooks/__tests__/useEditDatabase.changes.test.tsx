import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useEditDatabase, type UseEditDatabaseDeps } from "../useEditDatabase";
import type { DataTable, DatabaseHookResult, DataTableTarget } from "../../types/database";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("宿主提供差量能力时不发送整表旧 rows，也不覆盖活动视图", async () => {
  const initial: DataTable = {
    id: 1,
    columns: [{ id: "title", title: "名称", type: "text" }],
    rows: [{ id: "r", title: "旧标题" }],
    activeViewId: 1,
    createTime: 0,
    updateTime: 0,
  };
  const updateDataTable = vi.fn();
  const updateDataTableChanges = vi.fn(async () => ({
    ...initial,
    rows: [{ id: "r", title: "新标题", detailContentId: 71 }],
    activeViewId: 8,
  }));
  const deps = {
    getDataTableDetail: async () => ({ table: initial, views: [] }),
    updateDataTable,
    updateDataTableChanges,
  } as unknown as UseEditDatabaseDeps;
  let result: DatabaseHookResult | null = null;
  function Probe() {
    result = useEditDatabase(1, deps);
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    const data = { columns: initial.columns, rows: [{ id: "r", title: "新标题" }] };
    const changes = {
      rows: { upsert: [{ id: "r", title: "新标题" }], remove: [] },
      columnsChanged: false,
    };
    await act(async () => {
      await result!.onDataChange!(data, changes);
    });
    expect(updateDataTable).not.toHaveBeenCalled();
    expect(updateDataTableChanges).toHaveBeenCalledExactlyOnceWith({ id: 1, rows: changes.rows });
    expect(result!.table!.rows[0].detailContentId).toBe(71);
    expect(result!.table!.activeViewId).toBe(8);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("读到本机数字 ID 后仍携带原稳定引用写入，切换来源时忽略旧请求结果", async () => {
  const first = { sourceId: "first", kind: "data-table" as const, entityId: "table" };
  const second = { ...first, sourceId: "second" };
  const table = (title: string): DataTable => ({
    id: 1,
    createTime: 0,
    updateTime: 0,
    columns: [],
    rows: [{ id: "row", title }],
    activeViewId: null,
  });
  let completeWrite!: (value: DataTable) => void;
  const write = vi.fn(
    () =>
      new Promise<DataTable>(resolve => {
        completeWrite = resolve;
      })
  );
  const deps = {
    getDataTableDetail: async (target: DataTableTarget) => ({
      table: table((target as typeof first).sourceId),
      views: [],
    }),
    updateDataTableChanges: write,
  } as unknown as UseEditDatabaseDeps;
  let result: DatabaseHookResult | null = null;
  function Probe({ target }: { target: DataTableTarget }) {
    result = useEditDatabase(target, deps);
    return null;
  }
  const host = document.createElement("div"),
    root = createRoot(host);
  document.body.append(host);
  try {
    await act(async () => root.render(<Probe target={first} />));
    let pending: Promise<void> | void;
    act(() => {
      pending = result!.onDataChange!(
        { columns: [], rows: [] },
        { columnsChanged: false, rows: { upsert: [], remove: ["row"] } }
      );
    });
    expect(write).toHaveBeenCalledWith({ id: first, rows: { upsert: [], remove: ["row"] } });
    await act(async () => root.render(<Probe target={second} />));
    await act(async () => {
      completeWrite(table("旧请求结果"));
      await pending;
    });
    expect(result!.table!.rows[0].title).toBe("second");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it.each([new Error(""), new Error("raw table diagnostic"), "raw non-Error cause", undefined])(
  "读取失败保留原原因，切换来源后旧失败不能覆盖当前表",
  async cause => {
    let rejectRead: ((cause: unknown) => void) | undefined;
    const reads = vi.fn((target: DataTableTarget) =>
      target === 1
        ? new Promise<{ table: DataTable | null; views: [] }>((_, reject) => {
            rejectRead = reject;
          })
        : Promise.resolve({ table: null, views: [] })
    );
    const deps: UseEditDatabaseDeps = {
      getDataTableDetail: reads,
      updateDataTable: async () => null,
      updateDataTableView: async () => null,
      createDataTableView: async () => null,
      deleteDataTableView: async () => 0,
      setActiveDataTableView: async () => true,
      reorderDataTableViews: async () => undefined,
    };
    const state: { result: DatabaseHookResult | null } = { result: null };
    function Probe({ target }: { target: number }) {
      state.result = useEditDatabase(target, deps);
      return null;
    }
    const host = document.createElement("div"),
      root = createRoot(host);
    document.body.append(host);
    try {
      await act(async () => root.render(<Probe target={1} />));
      await act(async () => rejectRead?.(cause));
      expect(state.result?.issue).toEqual({ kind: "read", cause });
      expect(state.result?.issue?.cause).toBe(cause);
      const issue = state.result?.issue;
      await act(async () => root.render(<Probe target={1} />));
      expect(state.result?.issue).toBe(issue);
      expect(reads).toHaveBeenCalledTimes(1);
      await act(async () => root.render(<Probe target={2} />));
      expect(state.result?.issue).toBeUndefined();
      expect(reads).toHaveBeenCalledTimes(2);
      await act(async () => root.render(<Probe target={1} />));
      const lateReject = rejectRead;
      await act(async () => root.render(<Probe target={2} />));
      await act(async () => lateReject?.(cause));
      expect(state.result?.issue).toBeUndefined();
      expect(state.result?.loading).toBe(false);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
