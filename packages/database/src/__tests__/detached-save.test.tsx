import { act, createRef, forwardRef, useEffect, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "../Database";
import { defineDatabaseExtension } from "../extensions";
import type { RowDetailBodyHandle, RowDetailBodyProps } from "../DatabaseHostContext";
import type { ColumnDef, RowData, TableViewConfig } from "../types";

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
            if (isRowPresent()) await onRowChange({ noteRef: 71 });
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
    const patch = vi.fn(async () => true);
    const ref = createRef<DatabaseRef>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const rowDetailExtension = defineDatabaseExtension({
      id: "test.row-detail",
      create: () => ({ slots: { RowDetailBody: Body } }),
    });
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
                name: "表格",
                type: "table",
                order: 0,
                config,
              },
            ]}
            viewConfig={config}
            activeViewId={1}
            extensions={[rowDetailExtension]}
            onDataChange={save}
            onDetachedRowPatch={patch}
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
    expect(save).not.toHaveBeenCalled();
    if (deleted) expect(patch).not.toHaveBeenCalled();
    else {
      expect(patch).toHaveBeenCalledExactlyOnceWith(
        "r",
        { id: "r", noteRef: 71 },
        { id: "r", title: "原行" }
      );
    }
    host.remove();
  }
);

it.each([false, true])(
  "重开同表后修改或删除行，旧实例的晚到补丁不提交整表快照（删除=%s）",
  async deleted => {
    let resolve!: () => void;
    const ready = new Promise<void>(done => {
      resolve = done;
    });
    let pending: Promise<void> | undefined;
    let persisted: RowData[] = [{ id: "r", title: "原行" }];
    const oldSnapshotSave = vi.fn();
    const patch = vi.fn(async (id: string, values: Partial<RowData>) => {
      if (!persisted.some(row => row.id === id)) return false;
      persisted = persisted.map(row => (row.id === id ? { ...row, ...values } : row));
      return true;
    });
    const Body = forwardRef<RowDetailBodyHandle, RowDetailBodyProps>(({ onRowChange }, ref) => {
      const flush = () =>
        (pending ??= ready.then(async () => {
          await onRowChange({ noteRef: 71 });
        }));
      useImperativeHandle(ref, () => ({ flush }));
      useEffect(
        () => () => {
          void flush();
        },
        []
      );
      return null;
    });
    const rowDetailExtension = defineDatabaseExtension({
      id: "test.row-detail",
      create: () => ({ slots: { RowDetailBody: Body } }),
    });
    const host = document.createElement("div");
    document.body.append(host);
    let root = createRoot(host);
    const props = {
      columns,
      data: persisted,
      views: [{ id: 1, name: "表格", type: "table" as const, order: 0, config }],
      viewConfig: config,
      activeViewId: 1,
    };
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database
              {...props}
              extensions={[rowDetailExtension]}
              onDataChange={oldSnapshotSave}
              onDetachedRowPatch={patch}
            />
          </DndProvider>
        )
      );
      await act(async () => root.unmount());
      root = createRoot(host);
      const ref = createRef<DatabaseRef>();
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Database
              {...props}
              ref={ref}
              onDataChange={data => {
                persisted = data.rows;
              }}
            />
          </DndProvider>
        )
      );
      await act(async () =>
        ref.current!.dispatch(
          {
            type: "rows.apply",
            changes: {
              upsert: deleted ? [] : [{ id: "r", title: "新实例标题" }],
              remove: deleted ? ["r"] : [],
            },
          },
          "user"
        )
      );
      await act(async () => {
        resolve();
        await pending;
      });
      expect(oldSnapshotSave).not.toHaveBeenCalled();
      expect(persisted).toEqual(deleted ? [] : [{ id: "r", title: "新实例标题", noteRef: 71 }]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  }
);
