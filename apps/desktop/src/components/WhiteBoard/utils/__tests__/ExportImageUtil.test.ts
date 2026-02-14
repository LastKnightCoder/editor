import { describe, expect, it } from "vitest";
import type { BoardElement, Selection } from "../../types";
import {
  calculateExportBounds,
  cloneSelection,
  createExportFilename,
  createExportViewPort,
  resolveExportBackgroundColor,
  resolveExportElements,
} from "../ExportImageUtil";

const createRect = (
  id: string,
  overrides: Partial<BoardElement> = {},
): BoardElement =>
  ({
    id,
    type: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    ...overrides,
  }) as BoardElement;

const createBoardMock = (children: BoardElement[]) =>
  ({
    children,
    selection: { selectedElements: [], selectArea: null },
    getBounds: (element: BoardElement) => {
      if (element.type === "invalid") return null;
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x + element.width,
        maxY: element.y + element.height,
      };
    },
  }) as any;

describe("ExportImageUtil", () => {
  it("board 模式应返回所有根元素", () => {
    const children = [createRect("a"), createRect("b")];
    const board = createBoardMock(children);
    const result = resolveExportElements({
      board,
      action: "board",
    });
    expect(result).toEqual(children);
  });

  it("selection 模式应根据 id 解析元素并去重", () => {
    const child = createRect("child");
    const children = [
      {
        ...createRect("parent"),
        children: [child],
      } as BoardElement,
    ];
    const board = createBoardMock(children);

    const result = resolveExportElements({
      board,
      action: "selection",
      selectedElementIds: ["child", "missing", "child"],
    });
    expect(result.map((item) => item.id)).toEqual(["child"]);
  });

  it("selection 模式父子同时选中时应仅保留父节点", () => {
    const child = createRect("child");
    const parent = {
      ...createRect("parent"),
      children: [child],
    } as BoardElement;
    const board = createBoardMock([parent]);

    const result = resolveExportElements({
      board,
      action: "selection",
      selectedElementIds: ["parent", "child"],
    });

    expect(result.map((item) => item.id)).toEqual(["parent"]);
  });

  it("应正确合并导出边界", () => {
    const board = createBoardMock([]);
    const result = calculateExportBounds(board, [
      createRect("a", { x: 10, y: 20, width: 50, height: 40 }),
      createRect("b", { x: -30, y: -10, width: 20, height: 30 }),
    ]);

    expect(result).toEqual({
      minX: -30,
      minY: -10,
      maxX: 60,
      maxY: 60,
    });
  });

  it("无有效边界时应返回 null", () => {
    const board = createBoardMock([]);
    const result = calculateExportBounds(board, [
      {
        ...createRect("x"),
        type: "invalid",
      } as BoardElement,
    ]);

    expect(result).toBeNull();
  });

  it("父元素 bounds 不覆盖子元素时，仍应包含子元素边界", () => {
    const child = createRect("child", {
      x: 300,
      y: 400,
      width: 50,
      height: 30,
    });
    const parent = createRect("parent", {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      children: [child],
    }) as BoardElement;
    const board = createBoardMock([parent]);

    const result = calculateExportBounds(board, [parent]);
    expect(result).toEqual({
      minX: 0,
      minY: 0,
      maxX: 350,
      maxY: 430,
    });
  });

  it("应基于边界和 padding 生成导出视口", () => {
    const viewport = createExportViewPort(
      {
        minX: 100,
        minY: 200,
        maxX: 300,
        maxY: 500,
      },
      30,
    );

    expect(viewport).toEqual({
      minX: 70,
      minY: 170,
      width: 260,
      height: 360,
      zoom: 1,
    });
  });

  it("背景模式应映射为正确颜色", () => {
    expect(resolveExportBackgroundColor("light")).toBe("#ffffff");
    expect(resolveExportBackgroundColor("dark")).toBe("#0f172a");
    expect(resolveExportBackgroundColor("transparent")).toBeNull();
  });

  it("cloneSelection 应深拷贝 selection", () => {
    const source: Selection = {
      selectArea: {
        anchor: { x: 0, y: 0 },
        focus: { x: 10, y: 10 },
      },
      selectedElements: [createRect("a")],
    };
    const cloned = cloneSelection(source);
    cloned.selectedElements[0].x = 999;

    expect(source.selectedElements[0].x).toBe(0);
    expect(cloned).not.toBe(source);
  });

  it("文件名应带 action 前缀与 png 后缀", () => {
    expect(createExportFilename("board")).toMatch(
      /^whiteboard-\d{8}-\d{6}\.png$/,
    );
    expect(createExportFilename("selection")).toMatch(
      /^whiteboard-selection-\d{8}-\d{6}\.png$/,
    );
  });
});
