import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it } from "vitest";
import ViewTabs from "../ViewTabs";
import { createDatabaseStore } from "../DatabaseStore";
import PluginManager from "../PluginManager";
import { builtInPlugins } from "../plugins";
import { DatabaseContext } from "../DatabaseContext";
import type { ColumnDef, TableViewConfig } from "../types";
import type { DatabaseView } from "../types";

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const buildFixture = () => {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins(builtInPlugins as never);

  const columns: ColumnDef[] = [
    { id: "title", title: "标题", type: "text", width: 200, isPrimary: true },
    {
      id: "category",
      title: "分类",
      type: "select",
      width: 120,
      config: { options: [{ id: "lit", name: "摘录", color: "blue" as const }] },
    },
    { id: "update_time", title: "更新时间", type: "date", width: 140, readonly: true },
  ];

  const viewConfig: TableViewConfig = {
    columnOrder: columns.map(column => column.id),
    rowOrder: [],
    sorts: [{ id: "sort-1", fieldId: "update_time", direction: "desc", priority: 0 }],
    filters: null,
    groupBy: null,
  };

  const views: DatabaseView[] = [
    {
      id: 1,
      name: "全部卡片",
      type: "table",
      order: 0,
      config: viewConfig,
    },
  ];

  const store = createDatabaseStore(columns, [], viewConfig, views, 1, pluginManager);
  return { pluginManager, store };
};

const renderViewTabs = () => {
  const { pluginManager, store } = buildFixture();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  void act(() => {
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <DatabaseContext.Provider value={store}>
          <ViewTabs pluginManager={pluginManager} theme="light" />
        </DatabaseContext.Provider>
      </DndProvider>
    );
  });
  return host;
};

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

const pill = (label: string) => host.querySelector(`button[aria-label="${label}"]`);

/** Popover 内容经 Portal 挂到 body，面板断言查整棵文档树 */
const bodyText = () => document.body.textContent ?? "";

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("ViewTabs 工具栏", () => {
  it("渲染折叠搜索图标与三个胶囊钮，激活计数来自视图配置", () => {
    renderViewTabs();

    expect(pill("搜索本视图")).toBeTruthy();
    expect(pill("筛选")).toBeTruthy();
    expect(pill("分组")).toBeTruthy();

    // 视图自带 1 条排序规则：排序胶囊为激活态并显示计数 1
    const sortPill = pill("排序")!;
    expect(sortPill.getAttribute("aria-pressed")).toBe("true");
    expect(sortPill.textContent).toContain("1");
    // 无筛选规则：筛选胶囊未激活且无计数
    expect(pill("筛选")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("点击搜索图标展开输入框，Esc 清空关键词", () => {
    renderViewTabs();

    click(pill("搜索本视图")!);
    const input = host.querySelector<HTMLInputElement>('input[placeholder="搜索本视图…"]')!;
    expect(input).toBeTruthy();

    act(() => {
      setInputValue(input, "费曼");
    });
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(input.value).toBe("");
  });

  it("点击筛选胶囊打开新版筛选面板（分段控件 + 底部按钮行）", () => {
    renderViewTabs();

    click(pill("筛选")!);
    const text = bodyText();
    expect(text).toContain("满足全部条件");
    expect(text).toContain("满足任一条件");
    expect(text).toContain("添加条件组");
    expect(text).toContain("取消");
    expect(text).toContain("确定");
  });

  it("点击排序胶囊打开新版排序面板（方向切换钮与人话提示）", () => {
    renderViewTabs();

    click(pill("排序")!);
    expect(document.body.querySelector('button[title="当前降序，点击切换为升序"]')).toBeTruthy();
    expect(bodyText()).toContain("新→旧");
  });

  it("点击分组胶囊打开分组面板（组数预览）", () => {
    renderViewTabs();

    click(pill("分组")!);
    expect(bodyText()).toContain("按字段值聚合行");
    // 日期列按默认粒度（月）提供组数预览
    expect(bodyText()).toMatch(/\d+ 组/);
  });
});
