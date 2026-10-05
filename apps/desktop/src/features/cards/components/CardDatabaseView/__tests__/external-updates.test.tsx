import { act, createRef, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Database, { type DatabaseRef } from "@/components/Database/Database";
import CardDatabaseView from "..";
import type { DatabaseStoreType } from "@/components/Database/DatabaseContext";
import type { DatabaseProps } from "@/components/Database/types";
import { type ICard } from "@/types/card";

const mocks = vi.hoisted(() => ({
  store: undefined as DatabaseStoreType | undefined,
  updateView: vi.fn(),
}));
vi.mock("@/commands", () => ({ deleteContent: vi.fn(), updateCard: vi.fn() }));
vi.mock("@/utils/editor", () => ({ getEditorText: () => "标题" }));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ theme: "light", isDark: false }) }));
vi.mock("../plugins/CardLinksPlugin", () => ({ default: { type: "card-links" } }));
vi.mock("@/components/Database/plugins", async () => {
  const { default: select } = await import("@/components/Database/plugins/SelectPlugin");
  const { default: multiSelect } = await import("@/components/Database/plugins/MultiSelectPlugin");
  return { builtInPlugins: [select, multiSelect] };
});
vi.mock("@/components/Database/hooks", () => ({
  useColumnResize: () => ({ isResizing: false, startResize: () => {} }),
  useKeyboardNavigation: () => {},
}));
vi.mock("@/components/Database/ViewTabs", () => ({ default: () => null }));
vi.mock("@/components/Database/views/GalleryView", () => ({ default: () => null }));
vi.mock("@/components/Database/views/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/Database/views/KanbanView", () => ({ default: () => null }));
vi.mock("@/components/Database/views/TableView", async () => {
  const { DatabaseContext } = await import("@/components/Database/DatabaseContext");
  return {
    default: function MockTableView() {
      const store = useContext(DatabaseContext)!;
      mocks.store = store;
      const state = store();
      const { rows: orderedRows, grouped: isGrouped } = state.projection;
      return <div data-grouped={isGrouped}>{orderedRows.map(row => row.id).join(",")}</div>;
    },
  };
});
vi.mock("../../../databasePreferences", () => {
  const config = {
    columnOrder: ["title"],
    rowOrder: ["1", "2"],
    sorts: [],
    filters: null,
    groupBy: null,
  };
  const state = {
    views: [
      {
        id: 1,
        tableId: 0,
        name: "列表",
        type: "table",
        config,
        order: 0,
        createTime: 0,
        updateTime: 0,
      },
    ],
    activeViewId: 1,
    columnWidths: {},
    initializeDefaultView: () => {},
    updateView: mocks.updateView,
  };
  return { useCardDatabasePreferences: () => state };
});

let host: HTMLDivElement;
let root: Root;
const config = {
  columnOrder: ["title"],
  rowOrder: ["2", "1"],
  sorts: [],
  filters: null,
  groupBy: { id: "group-title", fieldId: "title" },
};
const props: DatabaseProps = {
  columns: [{ id: "title", title: "标题", type: "text" }],
  data: [
    { id: "1", title: "一" },
    { id: "2", title: "二" },
  ],
  views: [
    {
      id: 1,
      tableId: 0,
      name: "列表",
      type: "table",
      config,
      order: 0,
      createTime: 0,
      updateTime: 0,
    },
  ],
  activeViewId: 1,
  viewConfig: config,
};
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("props 重渲染不覆盖内部状态，显式外部补丁保留编辑且不回写", async () => {
  const ref = createRef<DatabaseRef>();
  const onDataChange = vi.fn();
  const onViewConfigChange = vi.fn();
  await act(async () =>
    root.render(
      <Database
        {...props}
        ref={ref}
        onDataChange={onDataChange}
        onViewConfigChange={onViewConfigChange}
      />
    )
  );
  await act(async () => {
    ref.current!.updateRow("1", { title: "本地修改" });
    mocks.store!.getState().selectCell("1", "title");
    mocks.store!.getState().startEditing("1", "title");
  });
  expect(onDataChange).toHaveBeenCalled();
  onDataChange.mockClear();
  onViewConfigChange.mockClear();
  await act(async () =>
    root.render(
      <Database
        {...props}
        data={[{ id: "3", title: "无效 props 更新" }]}
        ref={ref}
        onDataChange={onDataChange}
        onViewConfigChange={onViewConfigChange}
      />
    )
  );
  expect(ref.current!.getRows()[0].title).toBe("本地修改");
  await act(async () =>
    ref.current!.dispatch(
      {
        type: "rows.apply",
        changes: {
          upsert: [
            { id: "1", tags: ["新标签"] },
            { id: "3", title: "三" },
          ],
          remove: ["2"],
        },
      },
      "external"
    )
  );
  expect(ref.current!.getRows()).toEqual([
    { id: "1", title: "本地修改", tags: ["新标签"] },
    { id: "3", title: "三" },
  ]);
  expect(mocks.store!.getState().editingCell).toEqual({ rowId: "1", columnId: "title" });
  expect(onDataChange).not.toHaveBeenCalled();
  expect(onViewConfigChange).not.toHaveBeenCalled();
});

it("外部列宽更新保留编辑草稿并不触发保存回写", async () => {
  const ref = createRef<DatabaseRef>();
  const onDataChange = vi.fn();
  const onViewConfigChange = vi.fn();
  await act(async () =>
    root.render(
      <Database
        {...props}
        ref={ref}
        onDataChange={onDataChange}
        onViewConfigChange={onViewConfigChange}
      />
    )
  );
  await act(async () => {
    ref.current?.updateRow("1", { title: "未保存的输入" });
    mocks.store?.getState().startEditing("1", "title");
  });
  onDataChange.mockClear();
  onViewConfigChange.mockClear();
  await act(async () =>
    ref.current?.dispatch({ type: "column.resize", id: "title", width: 420 }, "external")
  );
  expect(mocks.store?.getState()).toMatchObject({
    columnWidths: { title: 420 },
    editingCell: { rowId: "1", columnId: "title" },
    viewConfig: { columnWidths: { title: 420 } },
  });
  expect(ref.current?.getRows().find(row => row.id === "1")?.title).toBe("未保存的输入");
  expect(onDataChange).not.toHaveBeenCalled();
  expect(onViewConfigChange).not.toHaveBeenCalled();
});

it("搜索范围按相关性呈现，清空后恢复内部行序和分组", async () => {
  const ref = createRef<DatabaseRef>();
  await act(async () => root.render(<Database {...props} ref={ref} />));
  const before = mocks.store!.getState().viewConfig;
  await act(async () => ref.current!.setQuery({ searchResults: ["1", "2"], grouping: "none" }));
  expect(host.textContent).toBe("1,2");
  expect(host.querySelector('[data-grouped="false"]')).toBeTruthy();
  await act(async () => {
    mocks.store!.getState().selectCell("1", "title");
    mocks.store!.getState().moveCellSelection("down");
  });
  expect(mocks.store!.getState().selectedCell?.rowId).toBe("2");
  await act(async () => {
    ref.current!.setQuery({ searchResults: ["1"], grouping: "none" });
    mocks.store!.getState().selectCell("1", "title");
    mocks.store!.getState().moveCellSelection("down");
  });
  expect(mocks.store!.getState().selectedCell?.rowId).toBe("1");
  await act(async () => ref.current!.setQuery({ searchResults: [], grouping: "none" }));
  expect(host.textContent).toBe("");
  expect(ref.current!.getRows()).toHaveLength(2);
  await act(async () => ref.current!.setQuery({ searchResults: null, grouping: "view" }));
  expect(host.textContent).toBe("2,1");
  expect(mocks.store!.getState().viewConfig).toBe(before);
});

it("卡片宿主通过增量操作接入新增、筛选和删除", async () => {
  const card = (id: number): ICard => ({
    id,
    contentId: id,
    content: [],
    count: 0,
    tags: [],
    links: [],
    isTop: false,
    create_time: 0,
    update_time: 0,
  });
  const first = card(1);
  const tagged = { ...card(2), tags: ["读书"] };
  const callbacks = {
    databaseName: "a",
    onCardClick: vi.fn(),
    onOpenCreateCard: vi.fn(),
    onDeleteCard: vi.fn(),
    onUpdateCard: vi.fn(),
  };
  await act(async () => root.render(<CardDatabaseView {...callbacks} cards={[first]} />));
  expect(host.textContent).toBe("1");
  await act(async () => root.render(<CardDatabaseView {...callbacks} cards={[tagged, first]} />));
  expect(host.textContent).toBe("1,2");
  await act(async () =>
    root.render(<CardDatabaseView {...callbacks} cards={[first, tagged]} tag="读书" />)
  );
  expect(host.textContent).toBe("2");
  expect(mocks.store!.getState().rows).toHaveLength(2);
  await act(async () => root.render(<CardDatabaseView {...callbacks} cards={[tagged]} />));
  expect(mocks.store!.getState().rows.map(row => row.id)).toEqual(["2"]);
  expect(callbacks.onUpdateCard).not.toHaveBeenCalled();
});
