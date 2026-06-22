import { describe, expect, it } from "vitest";
import { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import { IDocument, IDocumentItem } from "@/types";
import {
  buildDocumentTreeData,
  canMoveDocumentTreeItem,
  getAdjustedDocumentTreeInsertIndex,
  isDocumentDescendantNode,
} from "../documentTree";
import { parseDocumentMindMapItemId } from "../documentMindMap";

const DOCUMENT_ID = 100;

const createDocument = (children: number[]): IDocument => ({
  id: DOCUMENT_ID,
  createTime: 1,
  updateTime: 1,
  title: "知识库",
  desc: "",
  children,
  content: [],
  isTop: false,
});

const createItem = (id: number, children: number[] = []): IDocumentItem => ({
  id,
  createTime: 1,
  updateTime: 1,
  title: `文档 ${id}`,
  tags: [],
  children,
  isArticle: false,
  articleId: 0,
  isCard: false,
  cardId: 0,
  refType: "",
  refId: 0,
  content: [],
  parents: [],
  documents: [DOCUMENT_ID],
  count: 0,
  contentId: id,
});

const createMap = (items: IDocumentItem[]) =>
  new Map(items.map((item) => [item.id, item]));

const createDragItem = (
  itemId: number,
  parentId: number,
  parentChildren: number[],
  path: number[],
  rootId = DOCUMENT_ID,
): IDragItem => ({
  itemId,
  parentId,
  isRoot: parentId === rootId,
  path,
  children: [],
  parentChildren,
});

describe("buildDocumentTreeData", () => {
  it("处理空知识库", () => {
    const tree = buildDocumentTreeData(createDocument([]), new Map());
    expect(tree.nodes).toEqual([]);
    expect(tree.nodeMap.size).toBe(0);
  });

  it("按知识库 children 顺序构建多层树", () => {
    const document = createDocument([2, 1]);
    const tree = buildDocumentTreeData(
      document,
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(tree.nodes.map((node) => node.item.id)).toEqual([2, 1]);
    expect(tree.nodes[1].children.map((node) => node.item.id)).toEqual([3]);
    expect(tree.itemNodeMap.get(3)?.[0]?.parentId).toBe(1);
    expect(tree.itemNodeMap.get(3)?.[0]?.path).toEqual([1, 0]);
    expect(tree.nodeMap.get("3@1.0")?.parentId).toBe(1);
  });

  it("忽略缺失节点并阻止循环展开", () => {
    const document = createDocument([1, 99]);
    const tree = buildDocumentTreeData(
      document,
      createMap([createItem(1, [2]), createItem(2, [1])]),
    );

    expect(tree.nodes.map((node) => node.item.id)).toEqual([1]);
    expect(tree.nodes[0].children.map((node) => node.item.id)).toEqual([2]);
    expect(tree.nodes[0].children[0].children).toEqual([]);
  });

  it("为共享节点保留每个出现位置", () => {
    const tree = buildDocumentTreeData(
      createDocument([1, 2]),
      createMap([createItem(1, [3]), createItem(2, [3]), createItem(3)]),
    );

    expect(tree.itemNodeMap.get(3)?.map((node) => node.parentId)).toEqual([
      1, 2,
    ]);
    expect(tree.nodeMap.get("3@0.0")?.parentId).toBe(1);
    expect(tree.nodeMap.get("3@1.0")?.parentId).toBe(2);
  });
});

describe("isDocumentDescendantNode", () => {
  it("判断后代关系", () => {
    const tree = buildDocumentTreeData(
      createDocument([1]),
      createMap([createItem(1, [2]), createItem(2, [3]), createItem(3)]),
    );

    expect(isDocumentDescendantNode(tree, 1, 3)).toBe(true);
    expect(isDocumentDescendantNode(tree, 2, 1)).toBe(false);
  });
});

describe("canMoveDocumentTreeItem", () => {
  it("禁止拖拽到自己或自己的后代中", () => {
    const tree = buildDocumentTreeData(
      createDocument([1]),
      createMap([createItem(1, [2]), createItem(2, [3]), createItem(3)]),
    );
    const dragItem = createDragItem(1, 1, [1], [0]);

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 1,
        dragPosition: EDragPosition.Inside,
        insertParentId: DOCUMENT_ID,
        insertParentChildren: [2],
      }),
    ).toBe(false);

    expect(
      canMoveDocumentTreeItem({
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
    const tree = buildDocumentTreeData(
      createDocument([1, 2]),
      createMap([createItem(1, [3]), createItem(2, [3]), createItem(3)]),
    );
    const dragItem = createDragItem(3, 1, [3], [0, 0]);

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem,
        dropTargetId: 2,
        dragPosition: EDragPosition.Inside,
        insertParentId: 2,
        insertParentChildren: [3],
      }),
    ).toBe(false);

    expect(
      canMoveDocumentTreeItem({
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
    const tree = buildDocumentTreeData(
      createDocument([1, 2]),
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem: createDragItem(1, DOCUMENT_ID, [1, 2], [0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Bottom,
        insertParentId: DOCUMENT_ID,
        insertParentChildren: [1, 2],
        insertParentIsRoot: true,
      }),
    ).toBe(true);

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem: createDragItem(3, 1, [3], [0, 0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Inside,
        insertParentId: 2,
        insertParentChildren: [],
      }),
    ).toBe(true);

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem: createDragItem(3, 1, [3], [0, 0]),
        dropTargetId: 2,
        dragPosition: EDragPosition.Bottom,
        insertParentId: DOCUMENT_ID,
        insertParentChildren: [1, 2],
        insertParentIsRoot: true,
      }),
    ).toBe(true);
  });

  it("根知识库 ID 与条目 ID 碰撞时不把根父级误判成同 ID 条目", () => {
    const collidingDocumentId = 1;
    const tree = buildDocumentTreeData(
      {
        ...createDocument([2]),
        id: collidingDocumentId,
      },
      createMap([createItem(1, [3]), createItem(2), createItem(3)]),
    );

    expect(
      canMoveDocumentTreeItem({
        treeData: tree,
        dragItem: createDragItem(2, 1, [2], [0], collidingDocumentId),
        dropTargetId: 1,
        dragPosition: EDragPosition.Inside,
        insertParentId: 1,
        insertParentChildren: [3],
        insertParentIsRoot: false,
      }),
    ).toBe(true);
  });
});

describe("getAdjustedDocumentTreeInsertIndex", () => {
  it("同父级向下移动时根据原 children 修正插入位置", () => {
    expect(
      getAdjustedDocumentTreeInsertIndex({
        children: [1, 2, 3, 4],
        dragId: 2,
        insertIndex: 4,
      }),
    ).toBe(3);
  });

  it("跨父级移动时保持目标插入位置", () => {
    expect(
      getAdjustedDocumentTreeInsertIndex({
        children: [1, 3, 4],
        dragId: 2,
        insertIndex: 2,
      }),
    ).toBe(2);
  });
});

describe("parseDocumentMindMapItemId", () => {
  it("只解析有效的正整数文档节点 ID", () => {
    expect(parseDocumentMindMapItemId("document-item:12@0.1")).toBe(12);
    expect(parseDocumentMindMapItemId("document-item:12")).toBe(12);
    expect(parseDocumentMindMapItemId("document-item:")).toBeNull();
    expect(parseDocumentMindMapItemId("document-item:0@0")).toBeNull();
    expect(parseDocumentMindMapItemId("document-item:abc@0")).toBeNull();
    expect(parseDocumentMindMapItemId("document:1")).toBeNull();
  });
});
