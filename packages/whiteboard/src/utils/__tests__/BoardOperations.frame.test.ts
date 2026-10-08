import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, FrameElement, Operation } from "../../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const createFrame = (id: string, overrides: Partial<FrameElement> = {}): FrameElement => ({
  id,
  type: "frame",
  title: overrides.title ?? id,
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 200,
  height: overrides.height ?? 160,
  children: overrides.children ? clone(overrides.children) : [],
  backgroundColor: overrides.backgroundColor ?? "#fff",
  borderColor: overrides.borderColor ?? "#000",
  borderWidth: overrides.borderWidth ?? 1,
  borderRadius: overrides.borderRadius ?? 8,
  padding: overrides.padding ?? 8,
  containmentPolicy: overrides.containmentPolicy ?? "full",
  removalPolicy: overrides.removalPolicy ?? "full",
  autoResize: overrides.autoResize ?? false,
  minWidth: overrides.minWidth ?? 80,
  minHeight: overrides.minHeight ?? 80,
  isChildMoveIn: overrides.isChildMoveIn ?? false,
  ...overrides,
});

const createRect = (id: string, overrides: Partial<BoardElement> = {}): BoardElement => ({
  id,
  type: "rect",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 40,
  height: overrides.height ?? 30,
  ...overrides,
});

const apply = (children: BoardElement[], ops: Operation[]) =>
  BoardOperations.applyOperations({ children: clone(children) }, ops, {
    skipSelectionOperations: true,
    skipViewPortOperations: true,
  });

describe("BoardOperations - Frame 基础场景", () => {
  it("move_node 能将元素移入 Frame", () => {
    const frame = createFrame("frame-1", {
      children: [createRect("inner")],
    });
    const outside = createRect("outside");

    const ops: Operation[] = [
      {
        type: "move_node",
        path: [1],
        newPath: [0, frame.children.length],
      },
    ];

    const { data } = apply([frame, outside], ops);
    const nextFrame = data.children[0] as FrameElement;
    expect(nextFrame.children?.map(child => child.id)).toEqual(["inner", "outside"]);
    expect(data.children.map(element => element.id)).toEqual(["frame-1"]);
  });

  it("move_node 能将元素移出 Frame", () => {
    const frameChild = createRect("inner");
    const frame = createFrame("frame-1", { children: [frameChild] });
    const anchor = createRect("anchor");

    const ops: Operation[] = [
      {
        type: "move_node",
        path: [0, 0],
        newPath: [1],
      },
    ];

    const { data } = apply([frame, anchor], ops);
    expect(data.children.map(element => element.id)).toEqual(["frame-1", "inner", "anchor"]);
    const nextFrame = data.children[0] as FrameElement;
    expect(nextFrame.children).toHaveLength(0);
  });

  it("删除 Frame 会移除其子节点", () => {
    const frame = createFrame("frame-1", {
      children: [createRect("inner")],
    });

    const { data } = apply(
      [frame],
      [
        {
          type: "remove_node",
          path: [0],
          node: clone(frame),
        },
      ]
    );

    expect(data.children).toHaveLength(0);
  });

  it("解散 Frame 时子元素会被移动到根层", () => {
    const childA = createRect("child-a");
    const childB = createRect("child-b");
    const frame = createFrame("frame-1", { children: [childA, childB] });

    const ops: Operation[] = [
      { type: "move_node", path: [0, 0], newPath: [1] },
      { type: "move_node", path: [0, 1], newPath: [2] },
      { type: "remove_node", path: [0], node: clone(frame) },
    ];

    const { data } = apply([frame], ops);
    expect(data.children.map(element => element.id)).toEqual(["child-a", "child-b"]);
  });
});

describe("BoardOperations - Frame 更复杂场景", () => {
  it("两个 Frame 之间移动元素并更新目标 Frame", () => {
    const shared = createRect("shared");
    const frameA = createFrame("frame-a", { children: [shared] });
    const frameB = createFrame("frame-b", { children: [] });
    const anchor = createRect("anchor");

    const ops: Operation[] = [
      { type: "move_node", path: [2], newPath: [0, frameA.children.length] },
      { type: "move_node", path: [0, 0], newPath: [1, 0] },
      {
        type: "set_node",
        path: [1],
        properties: { width: frameB.width, height: frameB.height },
        newProperties: {
          width: frameB.width + 40,
          height: frameB.height + 20,
        },
      },
    ];

    const { data } = apply([frameA, frameB, anchor], ops);
    const nextChildren = data.children;
    const nextA = nextChildren[0] as FrameElement;
    const nextB = nextChildren[1] as FrameElement;
    expect(nextChildren).toHaveLength(2);
    expect(nextA.children?.map(child => child.id)).toEqual(["anchor"]);
    expect(nextB.children?.map(child => child.id)).toEqual(["shared"]);
  });

  it("移入移出后调整 Frame 属性", () => {
    const child = createRect("inner");
    const frame = createFrame("frame-1", { children: [child] });
    const outsider = createRect("outsider", { x: 260 });
    const anchor = createRect("anchor");

    const expandedFrame = {
      ...clone(frame),
      width: frame.width + 100,
      height: frame.height + 40,
      children: [anchor, child, outsider],
      isChildMoveIn: true,
    };

    const ops: Operation[] = [
      { type: "move_node", path: [1], newPath: [0, frame.children.length] },
      { type: "move_node", path: [2], newPath: [0, 0] },
      {
        type: "set_node",
        path: [0],
        properties: {
          width: frame.width,
          height: frame.height,
          isChildMoveIn: frame.isChildMoveIn,
        },
        newProperties: {
          width: expandedFrame.width,
          height: expandedFrame.height,
          isChildMoveIn: expandedFrame.isChildMoveIn,
        },
      },
    ];

    const { data } = apply([frame, outsider, anchor], ops);
    const nextChildren = data.children;
    expect(nextChildren.map(node => node.id)).toEqual(["frame-1"]);

    const nextFrame = nextChildren[0] as FrameElement;
    expect(nextFrame.width).toBe(expandedFrame.width);
    expect(nextFrame.height).toBe(expandedFrame.height);
    expect(nextFrame.children?.map(node => node.id)).toEqual(["anchor", "inner", "outsider"]);
  });
});
