import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useEditDatabase, type UseEditDatabaseDeps } from "../useEditDatabase";
import type { DataTable, DataTableView, DatabaseHookResult } from "../../types/database";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const table: DataTable = {
  id: 1,
  columns: [],
  rows: [],
  activeViewId: 5,
  createTime: 0,
  updateTime: 0,
};

const views: DataTableView[] = [
  {
    id: 5,
    tableId: 1,
    name: "画廊",
    type: "gallery",
    order: 0,
    createTime: 0,
    updateTime: 0,
    config: {
      columnOrder: [],
      rowOrder: [],
      sorts: [],
      viewOptions: {
        gallery: { coverType: "detail" },
        kanban: { groupColumnId: "status" },
      },
    },
  },
];

it("onUpdateView 切换视图类型后只保留新类型的 viewOptions 子键", async () => {
  const updateDataTableView = vi.fn(async (view: DataTableView) => view);
  const deps = {
    getDataTableDetail: async () => ({ table, views }),
    updateDataTableView,
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
    await act(async () => {
      await result!.onUpdateView!(5, { name: "看板", type: "kanban" });
    });
    expect(updateDataTableView).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "看板",
        type: "kanban",
        config: expect.objectContaining({
          viewOptions: { kanban: { groupColumnId: "status" } },
        }),
      })
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("onUpdateView 提供新配置时优先生效；目标类型无配置时不落 viewOptions", async () => {
  const updateDataTableView = vi.fn(async (view: DataTableView) => view);
  const deps = {
    getDataTableDetail: async () => ({ table, views }),
    updateDataTableView,
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
    await act(async () => {
      await result!.onUpdateView!(5, {
        type: "calendar",
        viewOptions: { dateColumnId: "date" },
      });
    });
    expect(updateDataTableView.mock.calls[0][0].config.viewOptions).toEqual({
      calendar: { dateColumnId: "date" },
    });

    updateDataTableView.mockClear();
    await act(async () => {
      await result!.onUpdateView!(5, { name: "表格", type: "table" });
    });
    expect(updateDataTableView.mock.calls[0][0].config.viewOptions).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
