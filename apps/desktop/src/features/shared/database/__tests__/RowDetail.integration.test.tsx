import {
  RowDetailModal,
  createDatabaseStore,
  PluginManager,
  plugins,
  DatabaseContext,
  DatabaseHostContext,
} from "@tau/database";
import { RowDetailBody, isBlankDocument } from "../RowDetailBody";
const { builtInPlugins } = plugins;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import type { ColumnDef, RowData, TableViewConfig } from "@tau/database";
import type { DataTableView } from "@/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createContent = vi.fn<(content: Descendant[], count: number) => Promise<number>>(
  async () => 42
);
const deleteContent = vi.fn(async (_id: number) => 1);
vi.mock("@/commands/content", () => ({
  createContent: (content: Descendant[], count: number) => createContent(content, count),
  deleteContent: (id: number) => deleteContent(id),
}));

// 正文编辑器依赖协作会话与 slate 全家桶，这里只需要它把输入回传给 onChange
vi.mock("@/components/ContentEditor", () => ({
  default: ({ onChange }: { onChange?: (value: Descendant[]) => void }) => (
    <textarea
      data-testid="description"
      onChange={e =>
        onChange?.([
          { type: "paragraph", children: [{ type: "formatted", text: e.target.value }] },
        ] as Descendant[])
      }
    />
  ),
}));

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  createContent.mockClear();
  deleteContent.mockClear();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  document.body.innerHTML = "";
});

const columns: ColumnDef[] = [
  { id: "title", title: "名称", type: "text", width: 200, isPrimary: true },
  { id: "director", title: "导演", type: "text", width: 120 },
  { id: "note", title: "一句话", type: "text", width: 120 },
  { id: "rating", title: "个人评价", type: "star", width: 120 },
];

const buildStore = (rows: RowData[]) => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as never);
  // 行序与 rows 数组顺序不同：上一条 / 下一条必须按视图投影走
  const viewConfig: TableViewConfig = {
    columnOrder: columns.map(column => column.id),
    rowOrder: ["r2", "r1", "r3"],
    sorts: [],
    filters: null,
    groupBy: null,
  };
  const views: DataTableView[] = [
    {
      id: 1,
      tableId: 0,
      name: "全部影片",
      type: "table",
      order: 0,
      config: viewConfig,
      createTime: 0,
      updateTime: 0,
    },
  ];
  const store = createDatabaseStore(columns, rows, viewConfig, views, 1, pluginManager);
  return { store, pluginManager };
};

const fixtureRows = (): RowData[] => [
  { id: "r1", title: "捕风追影", director: "梁乐民", note: "", rating: 5 },
  { id: "r2", title: "好东西", director: "邵艺辉", note: "很好看", rating: 4 },
  { id: "r3", title: "酱园弄", director: "", note: "", rating: 3 },
];

async function renderDetail(
  rowId: string,
  props: Partial<{ onClose: () => void; onDeleteRow: (id: string) => void; readonly: boolean }> = {}
) {
  const fixture = buildStore(fixtureRows());
  const onClose = props.onClose ?? vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <DatabaseHostContext.Provider value={{ RowDetailBody }}>
          <DatabaseContext.Provider value={fixture.store}>
            <RowDetailModal
              rowId={rowId}
              columns={columns}
              pluginManager={fixture.pluginManager}
              theme="light"
              onClose={onClose}
              onDeleteRow={props.onDeleteRow}
              readonly={props.readonly}
            />
          </DatabaseContext.Provider>
        </DatabaseHostContext.Provider>
      </DndProvider>
    );
  });
  await act(async () => {
    await new Promise(r => setTimeout(r, 30));
  });
  return { ...fixture, onClose };
}

const card = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const titleInput = () => card().querySelector<HTMLTextAreaElement>("textarea[aria-label]")!;
const button = (label: string) =>
  card().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const buttonByText = (text: string) =>
  Array.from(card().querySelectorAll("button")).find(b => b.textContent?.includes(text));

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};
const press = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};
const typeInto = (el: HTMLTextAreaElement, value: string) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("RowDetailModal", () => {
  it("只有空段落的正文不创建内容，媒体节点视为有效正文", () => {
    const paragraph = (text: string) => ({ type: "paragraph", children: [{ text }] }) as Descendant;
    expect(isBlankDocument([paragraph("")])).toBe(true);
    expect(isBlankDocument([paragraph("正文")])).toBe(false);
    expect(isBlankDocument([{ type: "image", children: [{ text: "" }] } as Descendant])).toBe(
      false
    );
  });

  it("正文创建期间删除所属行，迟到结果释放引用且不恢复行", async () => {
    let resolve!: (id: number) => void;
    createContent.mockImplementationOnce(
      () =>
        new Promise<number>(done => {
          resolve = done;
        })
    );
    const { store } = await renderDetail("r1");
    typeInto(card().querySelector<HTMLTextAreaElement>('[data-testid="description"]')!, "正文");
    await act(async () => {
      button("下一条").click();
    });
    expect(createContent).toHaveBeenCalledTimes(1);
    await act(async () => {
      store.getState().deleteRow("r1");
      resolve(73);
    });
    expect(store.getState().rows.some(row => row.id === "r1")).toBe(false);
    expect(deleteContent).toHaveBeenCalledWith(73);
  });

  it("直接卸载仍提交未落库正文，并且重复关闭共用一次创建", async () => {
    const { store } = await renderDetail("r1");
    typeInto(
      card().querySelector<HTMLTextAreaElement>('[data-testid="description"]')!,
      "卸载前正文"
    );
    await act(async () => {
      root!.unmount();
      root = undefined;
    });
    expect(createContent).toHaveBeenCalledTimes(1);
    expect(store.getState().rows.find(row => row.id === "r1")!.detailContentId).toBe(42);
  });

  it("头部显示视图名与视图行序中的位置，上一条 / 下一条与 J / K 按投影顺序切换", async () => {
    await renderDetail("r1");
    expect(card().textContent).toContain("全部影片");
    expect(card().textContent).toContain("2 / 3");
    expect(titleInput().value).toBe("捕风追影");

    await click(button("下一条"));
    expect(titleInput().value).toBe("酱园弄");
    expect(button("下一条").disabled).toBe(true);

    await press(card(), "k");
    await press(card(), "k");
    expect(titleInput().value).toBe("好东西");
    expect(card().textContent).toContain("1 / 3");
    expect(button("上一条").disabled).toBe(true);
  });

  it("在输入框里按 J / K 不切换行", async () => {
    await renderDetail("r1");
    await press(titleInput(), "j");
    expect(titleInput().value).toBe("捕风追影");
  });

  it("空的可编辑属性默认折叠，星级这类控件型属性始终展示", async () => {
    await renderDetail("r3");
    const text = () => card().textContent ?? "";
    expect(text()).toContain("个人评价");
    expect(text()).not.toContain("导演");
    expect(text()).toContain("还有 2 个空属性");

    await click(buttonByText("还有 2 个空属性")!);
    expect(text()).toContain("导演");
    expect(text()).toContain("一句话");
    expect(text()).toContain("收起空属性");
  });

  it("标题失焦即写回 store，写入的是当时那一行", async () => {
    const { store } = await renderDetail("r1");
    const input = titleInput();
    act(() => input.focus());
    typeInto(input, "捕风追影（重映）");
    expect(store.getState().rows.find(r => r.id === "r1")!.title).toBe("捕风追影");
    act(() => input.blur());
    expect(store.getState().rows.find(r => r.id === "r1")!.title).toBe("捕风追影（重映）");
  });

  it("未提交的标题在切换行时补存到原来的行", async () => {
    const { store } = await renderDetail("r1");
    typeInto(titleInput(), "改过的标题");
    await press(card(), "j");
    const rows = store.getState().rows;
    expect(rows.find(r => r.id === "r1")!.title).toBe("改过的标题");
    expect(rows.find(r => r.id === "r3")!.title).toBe("酱园弄");
  });

  it("编辑标题时按 Esc 关闭（不经失焦），卸载时补存", async () => {
    const unmount = vi.fn(() => {
      root!.unmount();
      root = undefined;
    });
    const { store } = await renderDetail("r1", { onClose: unmount });
    const input = titleInput();
    act(() => input.focus());
    typeInto(input, "Esc 前的标题");
    await press(input, "Escape");
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(store.getState().rows.find(r => r.id === "r1")!.title).toBe("Esc 前的标题");
  });

  it("没有正文 id 的行写了正文，离开时创建内容并回写 detailContentId", async () => {
    const { store } = await renderDetail("r1");
    const description = card().querySelector<HTMLTextAreaElement>('[data-testid="description"]')!;
    typeInto(description, "老派港式动作片");
    await press(card(), "j");
    expect(createContent).toHaveBeenCalledTimes(1);
    expect(store.getState().rows.find(r => r.id === "r1")!.detailContentId).toBe(42);
    expect(titleInput().value).toBe("酱园弄");
  });

  it("没写正文就离开不创建内容", async () => {
    const onClose = vi.fn();
    await renderDetail("r1", { onClose });
    await click(button("关闭"));
    expect(createContent).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("行被删除后自动关闭", async () => {
    const onClose = vi.fn();
    const { store } = await renderDetail("r1", { onClose });
    await act(async () => store.getState().deleteRow("r1"));
    expect(onClose).toHaveBeenCalled();
  });

  it("只读时不提供删除行、拖拽与添加属性入口", async () => {
    await renderDetail("r1", { readonly: true, onDeleteRow: vi.fn() });
    expect(button("更多")).toBeNull();
    expect(card().querySelector('[title="拖动调整顺序"]')).toBeNull();
    expect(titleInput().disabled).toBe(true);
  });
});
