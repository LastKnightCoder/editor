import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DatabaseExtension, DatabaseProps } from "@tau/database";
import { defineDatabaseExtension } from "@tau/database";
import { DesktopDatabase } from "../DesktopDatabase";
import { desktopDatabaseExtension } from "../desktopExtension";

const mocks = vi.hoisted(() => ({
  active: "a",
  props: null as DatabaseProps | null,
  deleteContent: vi.fn(async () => 1),
  patchRow: vi.fn(async () => true),
}));
vi.mock("@tau/database", () => ({
  LinkPlugin: { type: "link" },
  defineDatabaseExtension: (definition: Omit<DatabaseExtension, "apiVersion">) => definition,
  default: (props: DatabaseProps) => {
    mocks.props = props;
    return null;
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.active } } }) },
}));
vi.mock("@/commands/content", () => ({ deleteContent: mocks.deleteContent }));
vi.mock("@/commands/data-table", () => ({ patchDataTableRow: mocks.patchRow }));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("../RowDetailBody", () => ({ RowDetailBody: () => null }));
vi.mock("../useFormulaAssist", () => ({ useFormulaAssist: () => undefined }));
vi.mock("../GalleryCover", () => ({ GalleryCover: () => null }));
vi.mock("../plugins/ImagePlugin", () => ({ default: { type: "image" } }));
vi.mock("../plugins/AttachmentPlugin", () => ({ default: { type: "attachment" } }));
vi.mock("../plugins/RichTextPlugin", () => ({ default: { type: "rich-text" } }));
vi.mock("../plugins/LinkRenderer", () => ({ default: () => null }));

it("保留原实例的回调在切库后不再保存或释放正文引用", async () => {
  mocks.active = "a";
  mocks.deleteContent.mockClear();
  const save = vi.fn();
  const saveView = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const config = { columnOrder: [], rowOrder: [], sorts: [], filters: null };
  const change = {
    source: "user" as const,
    rows: { upsert: [], remove: [] },
    dataChanged: true,
    viewChanged: false,
  };
  try {
    await act(async () =>
      root.render(
        <DesktopDatabase
          columns={[]}
          data={[]}
          views={[]}
          activeViewId={1}
          viewConfig={config}
          onDataChange={save}
          onViewConfigChange={saveView}
        />
      )
    );
    const old = mocks.props!;
    old.onDataChange?.({ columns: [], rows: [] }, change);
    old.onViewConfigChange?.(config);
    await old.onRowCleanup?.({ id: "r", detailContentId: 17 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(mocks.deleteContent).toHaveBeenCalledExactlyOnceWith(17);
    mocks.active = "b";
    old.onDataChange?.({ columns: [], rows: [] }, change);
    old.onViewConfigChange?.(config);
    await old.onRowCleanup?.({ id: "r", detailContentId: 17 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(mocks.deleteContent).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("持久化视图字段只留在宿主，创建视图和晚到补丁通过闭包绑定表身份", async () => {
  mocks.active = "a";
  mocks.patchRow.mockClear();
  const config = { columnOrder: [], rowOrder: [], sorts: [], filters: null };
  const stored = {
    id: 3,
    tableId: 9,
    createTime: 11,
    updateTime: 22,
    name: "表格",
    type: "table" as const,
    order: 0,
    config,
  };
  const create = vi.fn(async () => stored);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DesktopDatabase
          tableId={9}
          columns={[]}
          data={[]}
          views={[stored]}
          activeViewId={3}
          viewConfig={config}
          onCreateView={create}
        />
      )
    );
    expect(mocks.props!.views[0]).toEqual({ id: 3, name: "表格", type: "table", order: 0, config });
    const created = await mocks.props!.onCreateView!({
      name: "新视图",
      type: "table",
      order: 1,
      config,
    });
    expect(created).not.toHaveProperty("tableId");
    expect(created).not.toHaveProperty("createTime");
    await mocks.props!.onDetachedRowPatch!(
      "r",
      { detailContentId: 71 },
      { id: "r", title: "旧标题" }
    );
    expect(mocks.patchRow).toHaveBeenCalledExactlyOnceWith({
      tableId: 9,
      rowId: "r",
      patch: { detailContentId: 71 },
      expected: { detailContentId: null },
    });
    mocks.active = "b";
    expect(await mocks.props!.onDetachedRowPatch!("r", { detailContentId: 72 }, { id: "r" })).toBe(
      false
    );
    expect(mocks.patchRow).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("扩展集经稳定合并传入：桌面扩展在前、调用方扩展跟随，未传时为桌面扩展常量", async () => {
  mocks.active = "a";
  const extra = defineDatabaseExtension({ id: "test.extra", create: () => ({}) });
  const config = { columnOrder: [], rowOrder: [], sorts: [], filters: null };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (extensions?: readonly DatabaseExtension[]) =>
    act(async () =>
      root.render(
        <DesktopDatabase
          columns={[]}
          data={[]}
          views={[]}
          activeViewId={1}
          viewConfig={config}
          extensions={extensions}
        />
      )
    );
  try {
    await render([extra]);
    expect(mocks.props!.extensions).toEqual([desktopDatabaseExtension, extra]);
    await render();
    expect(mocks.props!.extensions).toEqual([desktopDatabaseExtension]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
