import { describe, expect, it, vi } from "vitest";

import Board from "../../../../Board";
import { FramePlugin, ImagePlugin, MindPlugin } from "../../../../plugins";
import type { BoardElement, FrameElement, MindNodeElement } from "../../../../types";
import { canDropElementIntoParent } from "../utils";

const textStub = [{ type: "paragraph", children: [{ text: "" }] }] as any;

const createMindNode = (id: string, overrides: Partial<MindNodeElement> = {}): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 0,
  y: 0,
  width: 120,
  height: 40,
  actualHeight: 40,
  level: 1,
  children: [],
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
  direction: "right",
  text: textStub,
  ...overrides,
});

const createImage = (id: string): BoardElement => ({
  id,
  type: "image",
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  src: "image.png",
});

const createFrame = (id: string, children: BoardElement[] = []): FrameElement => ({
  id,
  type: "frame",
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  title: "Frame",
  children,
  backgroundColor: "transparent",
  borderColor: "#000",
  borderWidth: 1,
  borderRadius: 0,
  padding: 16,
  containmentPolicy: "full",
  removalPolicy: "partial",
  autoResize: false,
  minWidth: 100,
  minHeight: 100,
});

const createBoard = (children: BoardElement[]) =>
  new Board(
    children,
    { minX: 0, minY: 0, width: 1000, height: 1000, zoom: 1 },
    { selectedElements: [], selectArea: null },
    [new MindPlugin(), new FramePlugin(), new ImagePlugin()]
  );

describe("白板侧边栏树拖拽父级校验", () => {
  it("拒绝将 image 通过 Top/Bottom 插入 mind-node 父级", () => {
    const mindParent = createMindNode("mind-parent");
    const image = createImage("image");
    const board = createBoard([mindParent, image]);

    expect(canDropElementIntoParent(board, mindParent, image)).toBe(false);
  });

  it("允许将 mind-node 通过 Top/Bottom 插入 mind-node 父级", () => {
    const mindParent = createMindNode("mind-parent");
    const child = createMindNode("child");
    const board = createBoard([mindParent, child]);

    expect(canDropElementIntoParent(board, mindParent, child)).toBe(true);
  });

  it("允许 image 通过 Top/Bottom 放到根层", () => {
    const image = createImage("image");
    const board = createBoard([image]);

    expect(canDropElementIntoParent(board, null, image)).toBe(true);
  });

  it("允许 image 通过 Top/Bottom 插入 frame 父级", () => {
    const image = createImage("image");
    const frame = createFrame("frame");
    const board = createBoard([frame, image]);

    expect(canDropElementIntoParent(board, frame, image)).toBe(true);
  });
});
