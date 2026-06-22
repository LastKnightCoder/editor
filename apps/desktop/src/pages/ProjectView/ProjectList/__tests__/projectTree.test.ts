import { describe, expect, it } from "vitest";
import { EProjectItemType, EProjectType, Project, ProjectItem } from "@/types";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import {
  buildProjectTreeData,
  canMoveProjectTreeItem,
  getAdjustedProjectTreeInsertIndex,
  isDescendantNode,
} from "../projectTree";
import { parseProjectMindMapItemId } from "../projectMindMap";

const createProject = (children: number[]): Project => ({
  id: 1,
  createTime: 1,
  updateTime: 1,
  title: "项目",
  children,
  desc: [],
  archived: false,
  pinned: false,
  projectType: EProjectType.DocumentTree,
});

const createItem = (id: number, children: number[] = []): ProjectItem => ({
  id,
  createTime: 1,
  updateTime: 1,
  title: `节点 ${id}`,
  content: [],
  children,
  parents: [],
  projects: [1],
  refType: "",
  refId: 0,
  projectItemType: EProjectItemType.Document,
  count: 0,
  contentId: id,
  whiteBoardContentId: 0,
});

const createMap = (items: ProjectItem[]) =>
  new Map(items.map((item) => [item.id, item]));

describe("buildProjectTreeData", () => {
  it("处理空项目", () => {
    const tree = buildProjectTreeData(createProject([]), new Map());
    expect(tree.nodes).toEqual([]);
    expect(tree.nodeMap.size).toBe(0);
  });

  it("按项目 children 顺序构建多层树", () => {
    const project = createProject([2, 1]);
    const tree = buildProjectTreeData(
      project,
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(tree.nodes.map((node) => node.item.id)).toEqual([2, 1]);
    expect(tree.nodes[1].children.map((node) => node.item.id)).toEqual([3]);
    expect(tree.itemNodeMap.get(3)?.[0]?.parentId).toBe(1);
    expect(tree.itemNodeMap.get(3)?.[0]?.path).toEqual([1, 0]);
    expect(tree.nodeMap.get("3@1.0")?.parentId).toBe(1);
  });

  it("忽略缺失节点并阻止循环展开", () => {
    const project = createProject([1, 99]);
    const tree = buildProjectTreeData(
      project,
      createMap([createItem(1, [2]), createItem(2, [1])]),
    );

    expect(tree.nodes.map((node) => node.item.id)).toEqual([1]);
    expect(tree.nodes[0].children.map((node) => node.item.id)).toEqual([2]);
    expect(tree.nodes[0].children[0].children).toEqual([]);
  });

  it("为共享节点保留每个出现位置", () => {
    const tree = buildProjectTreeData(
      createProject([1, 2]),
      createMap([createItem(1, [3]), createItem(2, [3]), createItem(3)]),
    );

    expect(tree.itemNodeMap.get(3)?.map((node) => node.parentId)).toEqual([
      1, 2,
    ]);
    expect(tree.nodeMap.get("3@0.0")?.parentId).toBe(1);
    expect(tree.nodeMap.get("3@1.0")?.parentId).toBe(2);
  });
});

describe("isDescendantNode", () => {
  it("判断后代关系", () => {
    const tree = buildProjectTreeData(
      createProject([1]),
      createMap([createItem(1, [2]), createItem(2, [3]), createItem(3)]),
    );

    expect(isDescendantNode(tree, 1, 3)).toBe(true);
    expect(isDescendantNode(tree, 2, 1)).toBe(false);
  });
});

describe("canMoveProjectTreeItem", () => {
  const createDragItem = (
    itemId: number,
    parentId: number,
    parentChildren: number[],
    path: number[],
  ): IDragItem => ({
    itemId,
    parentId,
    isRoot: parentId === 1,
    path,
    children: [],
    parentChildren,
  });

  it("禁止拖拽到自己或自己的后代中", () => {
    const tree = buildProjectTreeData(
      createProject([1]),
      createMap([createItem(1, [2]), createItem(2, [3]), createItem(3)]),
    );
    const dragItem = createDragItem(1, 1, [1], [0]);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 1,
        dragPosition: EDragPosition.Inside,
        insertParentId: 1,
        insertParentChildren: [2],
      }),
    ).toBe(false);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 3,
        dragPosition: EDragPosition.Inside,
        insertParentId: 3,
        insertParentChildren: [],
      }),
    ).toBe(false);
  });

  it("禁止拖到已经包含相同文档的父节点下", () => {
    const tree = buildProjectTreeData(
      createProject([1, 2]),
      createMap([createItem(1, [3]), createItem(2, [3]), createItem(3)]),
    );
    const dragItem = createDragItem(3, 1, [3], [0, 0]);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 2,
        dragPosition: EDragPosition.Inside,
        insertParentId: 2,
        insertParentChildren: [3],
      }),
    ).toBe(false);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 2,
        dragPosition: EDragPosition.Bottom,
        insertParentId: 2,
        insertParentChildren: [3],
      }),
    ).toBe(false);
  });

  it("允许根节点重排、跨父级移动和移动到根", () => {
    const tree = buildProjectTreeData(
      createProject([1, 2]),
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem: createDragItem(1, 1, [1, 2], [0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Bottom,
        insertParentId: 1,
        insertParentChildren: [1, 2],
        insertParentIsRoot: true,
      }),
    ).toBe(true);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem: createDragItem(3, 1, [3], [0, 0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Inside,
        insertParentId: 2,
        insertParentChildren: [],
      }),
    ).toBe(true);

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem: createDragItem(3, 1, [3], [0, 0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Bottom,
        insertParentId: 1,
        insertParentChildren: [1, 2],
        insertParentIsRoot: true,
      }),
    ).toBe(true);
  });

  it("根项目 ID 与条目 ID 碰撞时不把根父级误判成同 ID 条目", () => {
    const tree = buildProjectTreeData(
      createProject([2]),
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(
      canMoveProjectTreeItem({
        treeData: tree,
        dragItem: createDragItem(2, 1, [2], [0]),
        dropTargetId: 1,
        dragPosition: EDragPosition.Inside,
        insertParentId: 1,
        insertParentChildren: [3],
        insertParentIsRoot: false,
      }),
    ).toBe(true);
  });
});

describe("getAdjustedProjectTreeInsertIndex", () => {
  it("同父级向下移动时根据原 children 修正插入位置", () => {
    expect(
      getAdjustedProjectTreeInsertIndex({
        children: [1, 2, 3, 4],
        dragId: 2,
        insertIndex: 4,
      }),
    ).toBe(3);
  });

  it("跨父级移动时保持目标插入位置", () => {
    expect(
      getAdjustedProjectTreeInsertIndex({
        children: [1, 3, 4],
        dragId: 2,
        insertIndex: 2,
      }),
    ).toBe(2);
  });
});

describe("parseProjectMindMapItemId", () => {
  it("只解析有效的正整数项目节点 ID", () => {
    expect(parseProjectMindMapItemId("project-item:12@0.1")).toBe(12);
    expect(parseProjectMindMapItemId("project-item:12")).toBe(12);
    expect(parseProjectMindMapItemId("project-item:")).toBeNull();
    expect(parseProjectMindMapItemId("project-item:0@0")).toBeNull();
    expect(parseProjectMindMapItemId("project-item:abc@0")).toBeNull();
    expect(parseProjectMindMapItemId("project:1")).toBeNull();
  });
});
