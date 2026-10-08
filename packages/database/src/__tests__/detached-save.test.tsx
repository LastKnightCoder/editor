import { act, createRef, forwardRef, useEffect, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "../Database";
import type { RowDetailBodyHandle, RowDetailBodyProps } from "../DatabaseHostContext";
import type { ColumnDef, TableViewConfig } from "../types";

const columns: ColumnDef[] = [{ id: "title", title: "名称", type: "text", isPrimary: true }];
const config: TableViewConfig = {
  columnOrder: ["title"],
  rowOrder: ["r"],
  sorts: [],
  filters: null,
};
vi.mock("../views/TableView", async () => {
  const { default: RowDetailModal } = await import("../components/RowDetailModal");
  return {
    default: (props: { pluginManager: import("../PluginManager").PluginManager }) => (
      <RowDetailModal
        rowId="r"
        columns={columns}
        theme="light"
        onClose={() => undefined}
        {...props}
      />
    ),
  };
});

it.each([false, true])(
  "父实例卸载后的正文补丁仍保存一次，已删除行不恢复（删除=%s）",
  async deleted => {
    let resolve!: () => void;
    const ready = new Promise<void>(done => {
      resolve = done;
    });
    let pending: Promise<void> | undefined;
    const Body = forwardRef<RowDetailBodyHandle, RowDetailBodyProps>(
      ({ onRowChange, isRowPresent }, ref) => {
        const flush = () =>
          (pending ??= ready.then(async () => {
            if (isRowPresent()) await onRowChange({ detailContentId: 71 });
          }));
        useImperativeHandle(ref, () => ({ flush }));
        useEffect(
          () => () => {
            void flush();
          },
          []
        );
        return <div>正文草稿</div>;
      }
    );
    const save = vi.fn();
    const ref = createRef<DatabaseRef>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Database
            ref={ref}
            columns={columns}
            data={[{ id: "r", title: "原行" }]}
            views={[
              {
                id: 1,
                tableId: 1,
                name: "表格",
                type: "table",
                order: 0,
                config,
                createTime: 0,
                updateTime: 0,
              },
            ]}
            viewConfig={config}
            activeViewId={1}
            slots={{ RowDetailBody: Body }}
            onDataChange={save}
          />
        </DndProvider>
      )
    );
    if (deleted)
      await act(async () =>
        ref.current?.dispatch(
          { type: "rows.apply", changes: { upsert: [], remove: ["r"] } },
          "external"
        )
      );
    await act(async () => root.unmount());
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      resolve();
      await pending;
    });
    if (deleted) expect(save).not.toHaveBeenCalled();
    else {
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].rows).toEqual([{ id: "r", title: "原行", detailContentId: 71 }]);
      expect(save.mock.calls[0][1].source).toBe("user");
    }
    host.remove();
  }
);
