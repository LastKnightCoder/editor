import { describe, it, expect } from "vitest";
import BoardOperations from "../BoardOperations";
import { BoardElement, MindNodeElement, Operation } from "../../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const textStub = [{ type: "paragraph", children: [{ text: "" }] }] as any;

const createMindNode = (
  id: string,
  overrides: Partial<MindNodeElement> = {},
): MindNodeElement => ({
  id,
  type: "mind-node",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 120,
  height: overrides.height ?? 40,
  actualHeight: overrides.actualHeight ?? overrides.height ?? 40,
  level: overrides.level ?? 1,
  children: overrides.children ? clone(overrides.children) : [],
  childrenHeight: overrides.childrenHeight ?? 0,
  leftChildrenHeight: overrides.leftChildrenHeight ?? 0,
  rightChildrenHeight: overrides.rightChildrenHeight ?? 0,
  direction: overrides.direction ?? "right",
  text: overrides.text ?? textStub,
  background: overrides.background ?? "#fff",
  border: overrides.border ?? "#000",
  textColor: overrides.textColor ?? "#000",
  ...overrides,
});

const apply = (children: BoardElement[], ops: Operation[]) =>
  BoardOperations.applyOperations({ children: clone(children) }, ops, {
    skipSelectionOperations: true,
    skipViewPortOperations: true,
  });

describe("BoardOperations - MindNode 基础场景", () => {
  it("set_node 更新 children 可添加 MindNode 子节点", () => {
    const root = createMindNode("root", {
      children: [createMindNode("child-1", { level: 2 })],
    });
    const updatedRoot = clone(root);
    updatedRoot.children.push(createMindNode("child-2", { level: 2 }));

    const ops: Operation[] = [
      {
        type: "set_node",
        path: [0],
        properties: clone(root),
        newProperties: updatedRoot,
      },
    ];

    const result = apply([root], ops);
    const children = (result.data.children[0] as MindNodeElement).children!;
    expect(children.map((node) => node.id)).toEqual(["child-1", "child-2"]);
  });

  it("同级添加 MindNode 兄弟节点保持顺序稳定", () => {
    const root = createMindNode("root", {
      children: [
        createMindNode("alpha", { level: 2 }),
        createMindNode("omega", { level: 2 }),
      ],
    });
    const updatedRoot = clone(root);
    updatedRoot.children.splice(1, 0, createMindNode("beta", { level: 2 }));

    const result = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: updatedRoot,
        },
      ],
    );

    const children = (result.data.children[0] as MindNodeElement).children!;
    expect(children.map((node) => node.id)).toEqual(["alpha", "beta", "omega"]);
  });

  it("拖拽可让节点成为另一节点的子节点", () => {
    const left = createMindNode("left", { level: 2 });
    const leaf = createMindNode("leaf", { level: 3 });
    const right = createMindNode("right", { level: 2, children: [leaf] });
    const root = createMindNode("root", { children: [left, right] });

    const updatedRoot = clone(root);
    (updatedRoot.children[0] as MindNodeElement).children.push(leaf);
    (updatedRoot.children[1] as MindNodeElement).children = [];

    const result = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: updatedRoot,
        },
      ],
    );

    const [newLeft, newRight] = (result.data.children[0] as MindNodeElement)
      .children!;
    expect((newLeft as MindNodeElement).children.map((n) => n.id)).toEqual([
      "leaf",
    ]);
    expect((newRight as MindNodeElement).children).toHaveLength(0);
  });

  it("拖拽可创建新的父节点并移动已有节点", () => {
    const target = createMindNode("target", { level: 2 });
    const sibling = createMindNode("sibling", { level: 2 });
    const root = createMindNode("root", { children: [target, sibling] });

    const wrapper = createMindNode("wrapper", { level: 2, children: [target] });
    const updatedRoot = clone(root);
    updatedRoot.children = [wrapper, sibling];

    const result = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: updatedRoot,
        },
      ],
    );

    const rootChildren = (result.data.children[0] as MindNodeElement).children!;
    expect(rootChildren.map((node) => node.id)).toEqual(["wrapper", "sibling"]);
    expect(
      (rootChildren[0] as MindNodeElement).children.map((node) => node.id),
    ).toEqual(["target"]);
  });

  it("删除 MindNode 会连同其子树一起移除", () => {
    const branch = createMindNode("branch", {
      level: 2,
      children: [
        createMindNode("leaf-a", { level: 3 }),
        createMindNode("leaf-b", { level: 3 }),
      ],
    });
    const keep = createMindNode("keep", { level: 2 });
    const root = createMindNode("root", { children: [branch, keep] });

    const updatedRoot = clone(root);
    updatedRoot.children = [keep];

    const { data } = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: updatedRoot,
        },
      ],
    );

    const remaining = (data.children[0] as MindNodeElement).children!;
    expect(remaining.map((node) => node.id)).toEqual(["keep"]);
  });
});

describe("BoardOperations - MindNode 更复杂场景", () => {
  it("复杂重排：在根部插入 hub 节点并重新分配子树", () => {
    const branch = createMindNode("branch", {
      level: 2,
      children: [createMindNode("branch-leaf", { level: 3 })],
    });
    const solo = createMindNode("solo", { level: 2 });
    const root = createMindNode("root", { children: [branch, solo] });

    const reorganized = clone(root);
    const sourceBranch = reorganized.children[0] as MindNodeElement;
    const hub = createMindNode("hub", { level: 2, children: [sourceBranch] });
    const soloNode = reorganized.children[1] as MindNodeElement;
    soloNode.children = [createMindNode("solo-child", { level: 3 })];
    reorganized.children = [
      hub,
      soloNode,
      createMindNode("fresh", { level: 2 }),
    ];

    const { data } = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: reorganized,
        },
      ],
    );

    const tree = data.children[0] as MindNodeElement;
    expect(tree.children?.map((node) => node.id)).toEqual([
      "hub",
      "solo",
      "fresh",
    ]);
    const updatedHub = tree.children![0] as MindNodeElement;
    expect(updatedHub.children?.map((node) => node.id)).toEqual(["branch"]);
    const updatedSolo = tree.children![1] as MindNodeElement;
    expect(updatedSolo.children?.map((node) => node.id)).toEqual([
      "solo-child",
    ]);
  });

  it("批量更新：同时添加多个兄弟并移除旧子树", () => {
    const a = createMindNode("a", { level: 2 });
    const b = createMindNode("b", { level: 2 });
    const c = createMindNode("c", {
      level: 2,
      children: [createMindNode("c-leaf", { level: 3 })],
    });
    const root = createMindNode("root", { children: [a, b, c] });

    const reorganized = clone(root);
    const newLeft = createMindNode("new-left", {
      level: 2,
      children: [
        createMindNode("new-left-1", { level: 3 }),
        createMindNode("new-left-2", { level: 3 }),
      ],
    });
    reorganized.children = [
      newLeft,
      reorganized.children[2],
      createMindNode("new-right", { level: 2 }),
    ];
    (reorganized.children[1] as MindNodeElement).children = [];

    const { data } = apply(
      [root],
      [
        {
          type: "set_node",
          path: [0],
          properties: clone(root),
          newProperties: reorganized,
        },
      ],
    );

    const topLevel = (data.children[0] as MindNodeElement).children!;
    expect(topLevel.map((node) => node.id)).toEqual([
      "new-left",
      "c",
      "new-right",
    ]);
    expect(
      (topLevel[0] as MindNodeElement).children?.map((node) => node.id),
    ).toEqual(["new-left-1", "new-left-2"]);
    expect((topLevel[1] as MindNodeElement).children).toHaveLength(0);
  });
});
