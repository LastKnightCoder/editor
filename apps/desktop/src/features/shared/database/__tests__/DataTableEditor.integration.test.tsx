import { act } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Database from "better-sqlite3";
import { fallbackCommandContext } from "@tau/rpc";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { EditDatabaseDepsProvider, type UseEditDatabaseDeps } from "@tau/shared";
import { expect, it, vi } from "vitest";
import * as commands from "@/commands/data-table";
import DataTableTable from "../../../../../src-electron/main/modules/tables/data-table";
import DataTableViewTable from "../../../../../src-electron/main/modules/tables/data-table-view";
import DatabaseItemTable from "../../../../../src-electron/main/modules/tables/database-item";
import DataTableSourceTable from "../../../../../src-electron/main/modules/tables/data-table-source";
import { must } from "../../../../../src-electron/main/test-support";
import DatabaseWorkspace from "../DatabaseWorkspace";

vi.mock("electron");
vi.mock("../../../../../src-electron/main/modules/video-note-index-queue");
vi.mock("@/services/page-navigation", () => ({ openPage: vi.fn() }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "review" } } }) },
}));
vi.mock("../desktopExtension", async () => {
  const { defineDatabaseExtension } = await import("@tau/database");
  return {
    desktopDatabaseExtension: defineDatabaseExtension({ id: "test.database", create: () => ({}) }),
  };
});
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/electron", () => ({ ...bridge, on: vi.fn(), off: vi.fn() }));

const deps: UseEditDatabaseDeps = {
  ...commands,
  setActiveDataTableView: async (id, viewId) =>
    Boolean(await commands.setActiveDataTableView(id, viewId)),
};

function element(selector: string, text?: string, parent: ParentNode = document) {
  const found = [...parent.querySelectorAll<HTMLElement>(selector)].find(
    el => text === undefined || el.textContent?.trim() === text
  );
  if (!found) throw new Error(`找不到控件 ${selector} ${text ?? ""}`);
  return found;
}
const click = async (target: HTMLElement) => act(async () => target.click());
const press = async (target: HTMLElement, key: string, metaKey = false) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, metaKey, bubbles: true, cancelable: true })
    );
  });

it("从添加行、标签编辑器、字段设置到删除确认和撤销，当前表与重新打开的数据一致", async () => {
  const db = new Database(":memory:");
  db.exec(schema);
  const { dataTableId: id } = DatabaseItemTable.create(db, {
    title: "工作文章",
    source: {
      kind: "article",
      scope: { tags: ["工作", "周报"] },
      fields: ["title", "tags", "created"],
    },
  });
  const handlers = {
    ...DataTableTable.getListenEvents(),
    ...DataTableViewTable.getListenEvents(),
    ...DataTableSourceTable.getListenEvents(),
  };
  let delayNextWrite: Promise<void> | undefined;
  bridge.invoke.mockImplementation(async (name: keyof typeof handlers, ...args: unknown[]) => {
    const reply = Reflect.apply(handlers[name], undefined, [db, ...args, fallbackCommandContext]);
    if (name === "data-table:apply-changes" && delayNextWrite) {
      const pending = delayNextWrite;
      delayNextWrite = undefined;
      await pending;
    }
    return reply;
  });
  const rootEl = document.createElement("div");
  document.body.append(rootEl);
  const root = createRoot(rootEl);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(960);
  const table = () => must(DataTableTable.getDetail(db, id).table, "关联表");
  const read = () => table().rows;
  const handles = () => rootEl.querySelectorAll('button[title*="行操作"]');
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <DndProvider backend={HTML5Backend}>
            <EditDatabaseDepsProvider deps={deps}>
              <DatabaseWorkspace
                tableId={id}
                titleKey={id}
                title="工作文章"
                onTitleChange={vi.fn()}
                onTitleCommit={async () => undefined}
              />
            </EditDatabaseDepsProvider>
          </DndProvider>
        </QueryClientProvider>
      )
    );
    await click(element("button", "添加行"));
    const [row] = read();
    expect(row["src:tags"]).toEqual(["工作", "周报"]);
    expect(handles()).toHaveLength(1);
    const chip = element("span", "工作");
    await act(async () => {
      chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = element('input[autofocus], input[placeholder=""]') as HTMLInputElement;
    await act(async () => {
      must(
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set,
        "输入框 setter"
      ).call(input, "新标签");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press(input, "Enter");
    await press(input, "Escape");
    expect(read()[0]["src:tags"]).toEqual(["工作", "周报", "新标签"]);
    expect(JSON.parse(String(db.prepare("SELECT tags FROM articles").pluck().get()))).toContain(
      "新标签"
    );

    await click(element('button[title="数据来自文章"]'));
    await click(element("button", "调整范围与字段"));
    const author = must(element("label", "作者").querySelector("input"), "作者复选框");
    await click(author);
    expect(author.checked).toBe(true);
    await click(element("button", "保存", must(author.closest('[role="dialog"]'), "字段设置弹窗")));
    expect(table().source?.fields).toContain("author");
    expect(rootEl.querySelector('[title="作者"]')).not.toBeNull();
    expect(handles()).toHaveLength(1);

    await click(element('button[title*="行操作"]'));
    await click(element('[role="menu"]:not([inert]) [role="menuitem"]', "删除"));
    expect(read()).toHaveLength(1);
    await click(element('[role="dialog"][data-state="open"] button', "删除"));
    expect(read()).toEqual([]);
    expect(handles()).toHaveLength(0);
    await press(element('[tabindex="-1"]', undefined, rootEl), "z", true);
    expect(handles()).toHaveLength(0);
    expect(db.prepare("SELECT count(*) FROM articles").pluck().get()).toBe(0);

    // 两次写入已依次提交，IPC 先交付第二份快照。
    const slowReply = Promise.withResolvers<void>();
    delayNextWrite = slowReply.promise;
    await click(element("button", "添加行"));
    expect(handles()).toHaveLength(0);
    await click(element("button", "添加行"));
    expect(handles()).toHaveLength(2);
    await act(async () => slowReply.resolve());
    expect(handles()).toHaveLength(2);
    expect(new Set(read().map(row => row.id)).size).toBe(2);
  } finally {
    await act(async () => root.unmount());
    rootEl.remove();
    client.clear();
    vi.restoreAllMocks();
    db.close();
  }
});
