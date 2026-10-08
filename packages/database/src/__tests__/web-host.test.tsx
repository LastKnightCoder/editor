import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, expect, it, vi } from "vitest";
import Database, { type DatabaseRef, type DataTableView, type TableViewConfig } from "..";

afterEach(() => vi.unstubAllGlobals());

it.each(["table", "gallery", "calendar", "kanban"] as const)(
  "公开包在纯 Web 宿主挂载 %s 视图并接收外部更新",
  async type => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const config: TableViewConfig = {
      columnOrder: ["title", "date", "status"],
      rowOrder: ["row-a"],
      sorts: [],
      filters: null,
      galleryConfig: { coverType: "detail" },
      calendarConfig: { dateColumnId: "date" },
      kanbanConfig: { groupColumnId: "status" },
    };
    const view: DataTableView = {
      id: 1,
      tableId: 1,
      name: type,
      type,
      order: 0,
      config,
      createTime: 0,
      updateTime: 0,
    };
    const ref = createRef<DatabaseRef>();
    const save = vi.fn();
    const error = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host, { onUncaughtError: error });
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database
              ref={ref}
              columns={[
                { id: "title", title: "名称", type: "text", isPrimary: true },
                { id: "date", title: "日期", type: "date" },
                {
                  id: "status",
                  title: "状态",
                  type: "select",
                  config: { options: [{ id: "todo", name: "待处理", color: "gray" }] },
                },
              ]}
              data={[
                {
                  id: "row-a",
                  title: "Web 内容",
                  date: { start: Date.now(), end: Date.now() },
                  status: "todo",
                },
              ]}
              views={[view]}
              activeViewId={1}
              viewConfig={config}
              onDataChange={save}
            />
          </DndProvider>
        )
      );
      expect(error).not.toHaveBeenCalled();
      expect(ref.current?.getRows()[0].title).toBe("Web 内容");
      await act(async () =>
        ref.current?.dispatch(
          {
            type: "rows.apply",
            changes: { upsert: [{ id: "row-a", title: "确认更新" }], remove: [] },
          },
          "external"
        )
      );
      expect(ref.current?.getRows()[0].title).toBe("确认更新");
      expect(save).not.toHaveBeenCalled();
      expect(host.textContent).toContain(type);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
