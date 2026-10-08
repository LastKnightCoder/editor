import { act, forwardRef, useImperativeHandle, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DatabaseRef } from "@tau/database";
import CardDatabaseView from "..";
import type { DatabaseStoreType } from "@tau/database";
import type { DatabaseProps } from "@tau/database";
import { type ICard } from "@/types/card";

const mocks = vi.hoisted(() => ({
  store: undefined as DatabaseStoreType | undefined,
  updateView: vi.fn(),
}));
vi.mock("@/commands", () => ({ deleteContent: vi.fn(), updateCard: vi.fn() }));
vi.mock("@/utils/editor", () => ({ getEditorText: () => "标题" }));
vi.mock("@/hooks/useTheme", () => ({ default: () => ({ theme: "light", isDark: false }) }));
vi.mock("../plugins/CardLinksPlugin", () => ({ default: { type: "card-links" } }));
vi.mock("@tau/database", async importOriginal => {
  const actual = await importOriginal<typeof import("@tau/database")>();
  return {
    ...actual,
    default: forwardRef<DatabaseRef, DatabaseProps>(function Probe(props, ref) {
      const [store] = useState(() => {
        const manager = new actual.PluginManager();
        manager.registerPlugins(actual.plugins.builtInPlugins as never);
        return actual.createDatabaseStore(
          props.columns,
          props.data,
          props.viewConfig,
          props.views,
          props.activeViewId,
          manager
        );
      });
      mocks.store = store;
      useImperativeHandle(
        ref,
        () =>
          ({
            dispatch: (command, source) => store.getState().dispatch(command, source),
            setQuery: query => store.getState().setQuery(query),
            getRows: () => store.getState().rows,
          }) as DatabaseRef,
        [store]
      );
      const state = store();
      return <div>{state.projection.rows.map(row => row.id).join(",")}</div>;
    }),
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
