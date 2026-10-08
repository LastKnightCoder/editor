import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { CopyPastePlugin } from "../CopyPastePlugin";
import type { BoardElement, ContextMenuContext, Operation } from "../../types";
import BoardUtil from "../../utils/BoardUtil";

const createElement = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "geometry",
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  ...overrides,
});

beforeAll(() => {
  vi.spyOn(BoardUtil, "isBoard").mockImplementation((value: unknown) => {
    return Boolean(value && (value as any).children && !(value as any).id);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

const createBoardStub = (children: BoardElement[]) => {
  return {
    children,
    readonly: false,
    selection: {
      selectedElements: [],
      selectArea: null,
    },
    presentationManager: {
      isPresentationMode: false,
      isCreatingSequence: false,
    },
    capabilityService: {
      shouldReverseChildren: () => true,
      requiresRelayout: () => false,
    },
    apply: vi.fn(),
  } as any;
};

const createContext = (board: any, targetElements: BoardElement[]): ContextMenuContext => ({
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: targetElements,
  hitElements: targetElements,
  targetElements,
  isHitSelected: targetElements.length > 0,
  board,
});

describe("CopyPastePlugin - 层级菜单", () => {
  it("命中元素时应展示四个层级菜单项", () => {
    const plugin = new CopyPastePlugin();
    const board = createBoardStub([createElement("a"), createElement("b"), createElement("c")]);
    const ctx = createContext(board, [board.children[1]]);

    const items = plugin.getContextMenu(ctx);
    const keys = new Set(items.map(item => item.key));

    expect(keys.has("layer-move-up")).toBe(true);
    expect(keys.has("layer-move-down")).toBe(true);
    expect(keys.has("layer-move-top")).toBe(true);
    expect(keys.has("layer-move-bottom")).toBe(true);

    const layerItems = items.filter(item => item.key.startsWith("layer-move-"));
    layerItems.forEach(item => {
      expect(item.icon).toBeTruthy();
    });
  });

  it("跨父级多选时应置灰四个层级菜单项", () => {
    const plugin = new CopyPastePlugin();
    const board = createBoardStub([
      createElement("a"),
      createElement("frame", {
        type: "frame",
        children: [createElement("inner")],
      }),
      createElement("b"),
    ]);
    const ctx = createContext(board, [board.children[0], board.children[1].children[0]]);

    const items = plugin.getContextMenu(ctx);
    const layerItems = items.filter(item => item.key.startsWith("layer-move-"));

    expect(layerItems).toHaveLength(4);
    layerItems.forEach(item => {
      expect(item.disabled).toBe(true);
    });
  });

  it("可执行时点击菜单应触发 move_node", () => {
    const plugin = new CopyPastePlugin();
    const board = createBoardStub([createElement("a"), createElement("b"), createElement("c")]);
    const ctx = createContext(board, [board.children[1]]);

    const item = plugin.getContextMenu(ctx).find(menuItem => menuItem.key === "layer-move-top");

    expect(item).toBeTruthy();
    expect(item?.disabled).toBe(false);

    item?.onSelect(ctx);

    expect(board.apply).toHaveBeenCalled();
    const firstCallOps = (board.apply as any).mock.calls[0][0] as Operation[];
    expect(Array.isArray(firstCallOps)).toBe(true);
    expect(firstCallOps.some(op => op.type === "move_node")).toBe(true);
  });
});
