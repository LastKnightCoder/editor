import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database, { type DatabaseRef, type DatabaseView, type TableViewConfig } from "..";

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

const viewTypeCard = (name: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    button => button.querySelector("span.text-tau-body")?.textContent === name
  );

const renderDatabase = (onCreateView: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );

  const viewConfig: TableViewConfig = {
    columnOrder: ["title", "status"],
    rowOrder: [],
    sorts: [],
    filters: null,
    groupBy: null,
  };
  const view: DatabaseView = {
    id: 1,
    name: "全部",
    type: "table",
    order: 0,
    config: viewConfig,
  };

  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host, { onUncaughtError: () => {} });
  const ref = createRef<DatabaseRef>();
  void act(() => {
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Database
          ref={ref}
          columns={[
            { id: "title", title: "标题", type: "text", isPrimary: true },
            { id: "date", title: "日期", type: "date" },
            {
              id: "status",
              title: "状态",
              type: "select",
              config: { options: [{ id: "todo", name: "待处理", color: "blue" as const }] },
            },
          ]}
          data={[]}
          views={[view]}
          activeViewId={1}
          viewConfig={viewConfig}
          onCreateView={onCreateView}
        />
      </DndProvider>
    );
  });
  return { viewConfig, ref };
};

describe("创建视图（注册表驱动）", () => {
  it("创建看板视图时 onCreateView 收到的 config 写入 viewOptions.kanban", async () => {
    const onCreateView = vi.fn().mockResolvedValue(null);
    const { viewConfig } = renderDatabase(onCreateView);

    // 页签条尾部的「新视图」加号
    click(host.querySelector('button[class*="-ml-2"]')!);

    click(viewTypeCard("看板")!);
    const trigger = document.body.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
    click(trigger);
    click(
      Array.from(document.body.querySelectorAll('[role="option"]')).find(el =>
        el.textContent?.includes("状态")
      )!
    );
    await act(async () => {
      click(bodyButton("创建")!);
    });

    expect(onCreateView).toHaveBeenCalledTimes(1);
    expect(onCreateView).toHaveBeenCalledWith({
      type: "kanban",
      name: "看板",
      order: 1,
      config: expect.objectContaining({
        columnOrder: viewConfig.columnOrder,
        viewOptions: {
          kanban: {
            groupColumnId: "status",
            cardDisplay: { template: "task", showFieldLabels: false },
          },
        },
      }),
    });
  });

  it("创建日历视图时写入 viewOptions.calendar，不覆盖已有其它类型子键", async () => {
    const onCreateView = vi.fn().mockResolvedValue(null);
    const { viewConfig, ref } = renderDatabase(onCreateView);

    // 当前视图切为已带画廊配置的视图，新建日历视图应保留 gallery 子键
    await act(async () => {
      ref.current?.dispatch(
        {
          type: "view.receive",
          view: {
            id: 1,
            name: "全部",
            type: "gallery",
            order: 0,
            config: { ...viewConfig, viewOptions: { gallery: { coverType: "detail" } } },
          },
          activate: true,
        },
        "external"
      );
    });

    click(host.querySelector('button[class*="-ml-2"]')!);

    click(viewTypeCard("日历")!);
    const trigger = document.body.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
    click(trigger);
    click(
      Array.from(document.body.querySelectorAll('[role="option"]')).find(el =>
        el.textContent?.includes("日期")
      )!
    );
    await act(async () => {
      click(bodyButton("创建")!);
    });

    expect(onCreateView).toHaveBeenCalledTimes(1);
    const config = onCreateView.mock.calls[0][0].config;
    expect(config.viewOptions).toEqual({
      gallery: { coverType: "detail" },
      calendar: { dateColumnId: "date" },
    });
  });
});
