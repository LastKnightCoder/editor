/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

import type Board from "../../../Board";
import { getMindDragSourceId } from "../../../constants/mind";
import type { MindDragState, MindNodeElement } from "../../../types";
import MindDragOverlay from "..";

const textStub = [{ type: "paragraph", children: [{ text: "" }] }] as any;
const createNode = (id: string, overrides: Partial<MindNodeElement> = {}): MindNodeElement => ({
  id,
  type: "mind-node",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 100,
  height: overrides.height ?? 40,
  actualHeight: overrides.actualHeight ?? 40,
  level: overrides.level ?? 1,
  children: overrides.children ?? [],
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
  direction: overrides.direction ?? "right",
  text: textStub,
  ...overrides,
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MindDragOverlay", () => {
  it("渲染不可交互的拖拽影子和候选连接线", async () => {
    const target = createNode("target", { x: 100, y: 100 });
    const dragged = createNode("dragged", { x: 236, y: 100, level: 2 });
    const previewNode = { ...dragged, x: 300, y: 180 };
    const state: MindDragState = {
      mode: "preview",
      isDragging: true,
      draggedNode: dragged,
      sourceRootId: "source",
      originalParentId: "source",
      startPoint: { x: 0, y: 0 },
      dragOffset: { x: 0, y: 0 },
      previewNode,
      connectionLineColor: "#ff0000",
      pointerId: 1,
      currentTarget: {
        node: target,
        insertIndex: 0,
        direction: "right",
        horizontalDistance: 100,
        verticalDistance: 40,
        score: 0.9,
        connectionStart: { x: 200, y: 120 },
        connectionEnd: { x: 300, y: 200 },
      },
    };
    const plugin = {
      subscribe: () => () => {},
      getSnapshot: () => state,
    };
    const board = {
      children: [target],
      viewPort: { minX: 0, minY: 0, width: 1000, height: 800, zoom: 2 },
      getPlugin: () => plugin,
    } as unknown as Board;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <svg>
          <g id={getMindDragSourceId(dragged.id)}>
            <foreignObject width="100" height="40">
              <div data-preview-content="true">Dragged node</div>
            </foreignObject>
          </g>
          <MindDragOverlay board={board} />
        </svg>
      );
    });

    const overlay = container.querySelector<SVGGElement>('g[data-layer="mind-drag-overlay"]');
    const preview = container.querySelector<SVGGElement>('g[data-mind-drag-preview="dragged"]');
    const line = container.querySelector<SVGPathElement>("path");

    expect(overlay?.getAttribute("pointer-events")).toBe("none");
    expect(overlay?.getAttribute("data-export-ignore")).toBe("true");
    expect(preview?.getAttribute("transform")).toBe("translate(64 80)");
    expect(preview?.getAttribute("opacity")).toBe("0.9");
    expect(preview?.querySelector('[data-mind-drag-preview-clone="true"]')).toBeTruthy();
    expect(preview?.querySelector('[data-preview-content="true"]')?.textContent).toBe(
      "Dragged node"
    );
    expect(container.querySelectorAll(`#${getMindDragSourceId(dragged.id)}`)).toHaveLength(1);
    expect(line?.getAttribute("stroke-width")).toBe("1");
    expect(line?.getAttribute("stroke-dasharray")).toBe("3 2");

    await act(async () => root.unmount());
  });

  it("根节点实时平移时只渲染候选连接线", async () => {
    const target = createNode("target", { x: 100, y: 100 });
    const dragged = createNode("dragged", { x: 300, y: 100 });
    const state: MindDragState = {
      mode: "root-translate",
      isDragging: true,
      draggedNode: createNode("dragged", { x: 0, y: 0 }),
      sourceRootId: "dragged",
      originalParentId: null,
      startPoint: { x: 0, y: 0 },
      dragOffset: { x: 0, y: 0 },
      previewNode: dragged,
      connectionLineColor: "#ff0000",
      pointerId: 1,
      currentTarget: {
        node: target,
        insertIndex: 0,
        direction: "right",
        horizontalDistance: 100,
        verticalDistance: 0,
        score: 0.8,
        connectionStart: { x: 200, y: 120 },
        connectionEnd: { x: 300, y: 120 },
      },
    };
    const plugin = {
      subscribe: () => () => {},
      getSnapshot: () => state,
    };
    const board = {
      children: [target, dragged],
      viewPort: { minX: 0, minY: 0, width: 1000, height: 800, zoom: 1 },
      getPlugin: () => plugin,
    } as unknown as Board;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <svg>
          <g id={getMindDragSourceId(dragged.id)} />
          <MindDragOverlay board={board} />
        </svg>
      );
    });

    expect(container.querySelector('g[data-layer="mind-drag-overlay"] path')).toBeTruthy();
    expect(container.querySelector("[data-mind-drag-preview]")).toBeNull();
    expect(container.querySelector('[data-mind-drag-preview-clone="true"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
