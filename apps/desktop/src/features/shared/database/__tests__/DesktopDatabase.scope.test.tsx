import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DatabaseProps } from "@tau/database";
import { DesktopDatabase } from "../DesktopDatabase";

const mocks = vi.hoisted(() => ({
  active: "a",
  props: null as DatabaseProps | null,
  deleteContent: vi.fn(async () => 1),
}));
vi.mock("@tau/database", () => ({
  LinkPlugin: { type: "link" },
  default: (props: DatabaseProps) => {
    mocks.props = props;
    return null;
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: mocks.active } } }) },
}));
vi.mock("@/commands/content", () => ({ deleteContent: mocks.deleteContent }));
vi.mock("@/components/LocalImage", () => ({ default: () => null }));
vi.mock("../RowDetailBody", () => ({ RowDetailBody: () => null }));
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
