import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useEditDatabase, type UseEditDatabaseDeps } from "../useEditDatabase";
import type { DataTable, DatabaseHookResult } from "../../types/database";

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
