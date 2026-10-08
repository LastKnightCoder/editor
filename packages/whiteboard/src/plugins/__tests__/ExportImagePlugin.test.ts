import { describe, expect, it, vi } from "vitest";
import { ExportImagePlugin } from "../ExportImagePlugin";
import type { ContextMenuContext } from "../../types";

const createContext = (overrides: Partial<ContextMenuContext> = {}): ContextMenuContext => {
  return {
    clientX: 0,
    clientY: 0,
    viewPortPoint: { x: 0, y: 0 },
    selectedElements: [],
    hitElements: [],
    targetElements: [],
    isHitSelected: false,
    board: {
      emit: vi.fn(),
    } as any,
    ...overrides,
  };
};

describe("ExportImagePlugin", () => {
  it("始终展示导出白板菜单", () => {
    const plugin = new ExportImagePlugin();
    const items = plugin.getContextMenu(createContext());

    expect(items.some(item => item.key === "export-board-image")).toBe(true);
  });

  it("命中任意元素时展示导出元素菜单", () => {
    const plugin = new ExportImagePlugin();

    const itemsWithoutTarget = plugin.getContextMenu(
      createContext({
        isHitSelected: false,
        targetElements: [],
      })
    );
    expect(itemsWithoutTarget.some(item => item.key === "export-selection-image")).toBe(false);

    const itemsWithTarget = plugin.getContextMenu(
      createContext({
        isHitSelected: false,
        targetElements: [{ id: "a", type: "rect" } as any],
      })
    );
    expect(itemsWithTarget.some(item => item.key === "export-selection-image")).toBe(true);
  });

  it("导出选中元素菜单应携带 action 和 selectedElementIds", () => {
    const plugin = new ExportImagePlugin();
    const ctx = createContext({
      isHitSelected: true,
      targetElements: [{ id: "a", type: "rect" } as any, { id: "b", type: "image" } as any],
    });

    const item = plugin
      .getContextMenu(ctx)
      .find(menuItem => menuItem.key === "export-selection-image");

    expect(item).toBeTruthy();
    item?.onSelect(ctx);

    expect(ctx.board.emit).toHaveBeenCalledWith("context-menu:open-modal", {
      type: "export-image",
      action: "selection",
      selectedElementIds: ["a", "b"],
    });
  });
});
