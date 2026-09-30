import { act, forwardRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DatabaseProps, DatabaseRef } from "@/components/Database";
import {
  CARD_DATABASE_PREFERENCES_KEY,
  useCardsDatabasePreferencesStore,
} from "../../../databasePreferences";
import CardDatabaseView from "..";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), props: null as DatabaseProps | null }));
const { dispatch } = mocks;
vi.mock("@/utils/editor", () => ({ getEditorText: () => "标题" }));
vi.mock("@/constants", () => ({ cardCategoryName: {} }));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ isDark: false }) }));
vi.mock("../plugins/CardLinksPlugin", () => ({ default: { type: "card-links" } }));
vi.mock("@/components/Database", () => ({
  default: forwardRef<DatabaseRef, DatabaseProps>(function Probe(props, ref) {
    mocks.props = props;
    useImperativeHandle(
      ref,
      () => ({ dispatch, setQuery: () => undefined }) as unknown as DatabaseRef,
      []
    );
    return <output>{props.views.map(view => view.name).join(",")}</output>;
  }),
}));

let root: Root | undefined;
let host: HTMLDivElement;
const callbacks = {
  cards: [],
  selectCategory: "all" as const,
  onCardClick: vi.fn(),
  onOpenCreateCard: vi.fn(),
  onDeleteCard: vi.fn(),
  onUpdateCard: vi.fn(),
};
beforeEach(() => {
  localStorage.clear();
  useCardsDatabasePreferencesStore.setState({ byDatabase: {}, legacyDefaults: null });
  dispatch.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host.remove();
  localStorage.clear();
});

it("跨窗口配置刷新经 external 命令接入，切库后使用独立偏好", async () => {
  await act(async () => root?.render(<CardDatabaseView {...callbacks} databaseName="a" />));
  expect(host.textContent).toBe("所有卡片");
  const previous = useCardsDatabasePreferencesStore.getState().byDatabase.a;
  const incoming = {
    ...previous,
    views: previous.views.map(view => ({
      ...view,
      name: "窗口 B 的配置",
      config: { ...view.config, columnWidths: { title: 480 } },
    })),
    columnWidths: { title: 480 },
  };
  dispatch.mockClear();
  await act(async () => {
    localStorage.setItem(
      CARD_DATABASE_PREFERENCES_KEY,
      JSON.stringify({ version: 1, state: { legacyDefaults: null, byDatabase: { a: incoming } } })
    );
    window.dispatchEvent(new StorageEvent("storage", { key: CARD_DATABASE_PREFERENCES_KEY }));
  });
  expect(host.textContent).toBe("窗口 B 的配置");
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "view.receive",
      view: expect.objectContaining({ name: "窗口 B 的配置" }),
    }),
    "external"
  );
  expect(dispatch).toHaveBeenCalledWith(
    { type: "column.resize", id: "title", width: 480 },
    "external"
  );
  expect(callbacks.onUpdateCard).not.toHaveBeenCalled();
  await act(async () => root?.render(<CardDatabaseView {...callbacks} databaseName="b" />));
  expect(host.textContent).toBe("所有卡片");
  expect(useCardsDatabasePreferencesStore.getState().byDatabase.a.columnWidths.title).toBe(480);
});

it("切库后旧实例迟到的视图回调只更新原库，不认领新库同 ID 视图", async () => {
  const snapshot = {
    activeViewId: 1,
    columnWidths: {},
    views: [1, 2].map(id => ({
      id,
      tableId: 0,
      name: `视图 ${id}`,
      type: "table" as const,
      order: id,
      config: { columnOrder: [], rowOrder: [], sorts: [], filters: null, groupBy: null },
      createTime: 0,
      updateTime: 0,
    })),
  };
  useCardsDatabasePreferencesStore.setState({ legacyDefaults: snapshot });
  await act(async () => root?.render(<CardDatabaseView {...callbacks} databaseName="a" />));
  const previous = mocks.props?.onActiveViewIdChange;
  if (!previous) throw new Error("视图回调未接线");
  await act(async () => root?.render(<CardDatabaseView {...callbacks} databaseName="b" />));
  await act(async () => previous(2));
  expect(useCardsDatabasePreferencesStore.getState().byDatabase.a.activeViewId).toBe(2);
  expect(useCardsDatabasePreferencesStore.getState().byDatabase.b.activeViewId).toBe(1);
});
