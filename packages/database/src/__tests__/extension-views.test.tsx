import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "../Database";
import { createDatabaseStore } from "../DatabaseStore";
import { defineDatabaseExtension, installDatabaseExtensions } from "../extensions";
import type { DatabaseExtension } from "../extensions";
import type { DatabaseView, TableViewConfig } from "../types";
import type { DatabaseViewDefinition, ViewOptionsPanelProps } from "../views/types";

let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

const bodyButton = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.textContent?.trim() === text
  );

const menuItem = (text: string) =>
  Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
    item => item.textContent?.trim() === text
  );

const viewTypeCard = (name: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.querySelector("span.text-tau-body")?.textContent === name
  );

const bodyText = () => document.body.textContent ?? "";

interface TimelineOptions {
  granularity: "day" | "week" | "month";
}

const TimelineView = () => <div data-testid="acme-timeline">时间线视图内容</div>;

const TimelineOptionsPanel = ({ options, onChange }: ViewOptionsPanelProps<TimelineOptions>) => (
  <div>
    <span>时间线粒度</span>
    <button type="button" onClick={() => onChange({ granularity: "week" })}>
      切换为周
    </button>
    <span data-testid="timeline-granularity">{options?.granularity ?? "未设置"}</span>
  </div>
);

const timelineViewDefinition: DatabaseViewDefinition<TimelineOptions> = {
  type: "acme.timeline",
  name: "时间线",
  icon: () => <svg data-testid="timeline-icon" />,
  Component: TimelineView,
  createOptions: () => ({ granularity: "month" }),
  OptionsPanel: TimelineOptionsPanel,
};

const timelineExtension = defineDatabaseExtension({
  id: "acme.views",
  create: () => ({ views: [timelineViewDefinition] }),
});

const stubResizeObserver = () =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );

const baseConfig: TableViewConfig = {
  columnOrder: ["title"],
  rowOrder: [],
  sorts: [],
  filters: null,
  groupBy: null,
};

const renderDatabase = (overrides: {
  extensions?: readonly DatabaseExtension[];
  views?: DatabaseView[];
  onCreateView?: ReturnType<typeof vi.fn>;
}) => {
  stubResizeObserver();
  const view: DatabaseView = {
    id: 1,
    name: "表格",
    type: "table",
    order: 0,
    config: baseConfig,
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host, { onUncaughtError: () => {} });
  void act(() => {
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Database
          columns={[{ id: "title", title: "标题", type: "text", isPrimary: true }]}
          data={[{ id: "row-a", title: "内容" }]}
          views={overrides.views ?? [view]}
          activeViewId={1}
          viewConfig={baseConfig}
          extensions={overrides.extensions ?? [timelineExtension]}
          onCreateView={overrides.onCreateView}
        />
      </DndProvider>
    );
  });
};

describe("扩展贡献视图", () => {
  it("注册进运行时注册表：出现在新建视图列表、创建时写入 viewOptions[type]", async () => {
    const onCreateView = vi.fn().mockResolvedValue(null);
    renderDatabase({ onCreateView });

    click(host.querySelector('button[class*="-ml-2"]')!);
    expect(viewTypeCard("时间线")).toBeTruthy();

    click(viewTypeCard("时间线")!);
    await act(async () => {
      click(bodyButton("创建")!);
    });

    expect(onCreateView).toHaveBeenCalledTimes(1);
    expect(onCreateView).toHaveBeenCalledWith({
      type: "acme.timeline",
      name: "时间线",
      order: 1,
      config: expect.objectContaining({
        viewOptions: { "acme.timeline": { granularity: "month" } },
      }),
    });
  });

  it("创建成功后渲染扩展视图组件，编辑面板渲染其 OptionsPanel 并受控更新", async () => {
    renderDatabase({
      views: [
        { id: 1, name: "表格", type: "table", order: 0, config: baseConfig },
        {
          id: 2,
          name: "时间线",
          type: "acme.timeline",
          order: 1,
          config: {
            ...baseConfig,
            viewOptions: { "acme.timeline": { granularity: "month" } },
          },
        },
      ],
    });

    // 扩展视图出现在页签，激活后渲染其组件
    const tabs = Array.from(host.querySelectorAll(".group\\/tab")).filter(node =>
      node.textContent?.includes("时间线")
    );
    click(tabs[0]!);
    expect(document.querySelector('[data-testid="acme-timeline"]')).toBeTruthy();

    // 打开视图编辑浮层：类型下拉含时间线，专属配置区渲染扩展的 OptionsPanel
    const moreButton = tabs[0]!.querySelector('button[title="视图操作"]')!;
    click(moreButton);
    click(menuItem("编辑")!);
    expect(bodyText()).toContain("时间线粒度");

    // OptionsPanel 受控：点击切换推回草稿，保存按钮在 canSave 允许时可点击
    click(bodyButton("切换为周")!);
    expect(document.querySelector('[data-testid="timeline-granularity"]')?.textContent).toBe(
      "week"
    );
  });

  it("视图与内置类型重名、两扩展重名、无命名空间均报错，信息带扩展 id", () => {
    expect(() =>
      installDatabaseExtensions(
        [],
        [
          defineDatabaseExtension({
            id: "test.builtin",
            create: () => ({
              views: [{ ...timelineViewDefinition, type: "kanban" }],
            }),
          }),
        ]
      )
    ).toThrowError(/test\.builtin.*kanban/);

    expect(() =>
      installDatabaseExtensions(
        [],
        [
          timelineExtension,
          defineDatabaseExtension({
            id: "test.other",
            create: () => ({ views: [timelineViewDefinition] }),
          }),
        ]
      )
    ).toThrowError(/test\.other.*acme\.timeline/);

    expect(() =>
      installDatabaseExtensions(
        [],
        [
          defineDatabaseExtension({
            id: "test.plain",
            create: () => ({ views: [{ ...timelineViewDefinition, type: "timeline" }] }),
          }),
        ]
      )
    ).toThrowError(/test\.plain.*命名空间.*timeline/);
  });

  it("未知视图类型渲染占位且不丢数据：视图标签仍可见，可切回其它视图", () => {
    renderDatabase({
      views: [
        {
          id: 1,
          name: "幽灵视图",
          type: "ghost.view",
          order: 0,
          config: { ...baseConfig, viewOptions: { "ghost.view": { any: "thing" } } },
        },
        { id: 2, name: "表格", type: "table", order: 1, config: baseConfig },
      ],
    });

    expect(bodyText()).toContain("此视图类型不可用：ghost.view");
    // 页签仍显示视图名，视图可删除、可改为其它类型（数据保留由 store 用例覆盖）
    expect(host.textContent).toContain("幽灵视图");

    // 切回注册视图：占位消失，表格视图正常挂载（虚拟化下 jsdom 不渲染行，看列头）
    const tableTab = Array.from(host.querySelectorAll(".group\\/tab")).find(node =>
      node.textContent?.includes("表格")
    )!;
    click(tableTab);
    expect(host.textContent).not.toContain("此视图类型不可用");
    expect(host.textContent).toContain("添加行");
  });

  it("store 对未注册视图类型不改动 viewOptions 与行数据", () => {
    const store = createDatabaseStore(
      [{ id: "title", title: "标题", type: "text", isPrimary: true }],
      [{ id: "row-a", title: "内容" }],
      ghostConfig,
      [ghostView],
      9
    );
    expect(store.getState().projection.rows).toHaveLength(1);
    expect(store.getState().viewConfig.viewOptions).toEqual({ "ghost.view": { any: "thing" } });
    expect(store.getState().rows).toHaveLength(1);
  });
});

const ghostConfig: TableViewConfig = {
  columnOrder: ["title"],
  rowOrder: ["row-a"],
  sorts: [],
  filters: null,
  groupBy: null,
  viewOptions: { "ghost.view": { any: "thing" } },
};
const ghostView: DatabaseView = {
  id: 9,
  name: "幽灵",
  type: "ghost.view",
  order: 0,
  config: ghostConfig,
};
