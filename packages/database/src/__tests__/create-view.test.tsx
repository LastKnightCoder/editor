import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database, { type DatabaseView, type TableViewConfig } from "..";

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
  void act(() => {
    root!.render(
      <DndProvider backend={HTML5Backend}>
        <Database
          columns={[
            { id: "title", title: "标题", type: "text", isPrimary: true },
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
  return viewConfig;
};

describe("创建视图（注册表驱动）", () => {
  it("创建看板视图时 onCreateView 收到的 config 与既有格式一致", async () => {
    const onCreateView = vi.fn().mockResolvedValue(null);
    const viewConfig = renderDatabase(onCreateView);

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
        kanbanConfig: {
          groupColumnId: "status",
          cardDisplay: { template: "task", showFieldLabels: false },
        },
      }),
    });
  });
});
