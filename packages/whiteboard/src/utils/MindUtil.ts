import { produce } from "immer";
import type { Descendant } from "slate";
import { v4 as uuid } from "uuid";
import BoardUtil from "./BoardUtil.ts";
import PathUtil from "./PathUtil.ts";
import { Board, ElementBounds, MindNodeElement, MindDragTarget } from "../types";
import type { MindRange } from "../types/mind";
import MindThemeUtil from "./MindThemeUtil.ts";
import {
  getMindLayout,
  isSummary,
  normalizeTree,
  reconcileRanges,
  rangeNodes,
  shrinkRangesBeforeRemoval,
  stackChildren,
  visibleChildren,
  type MindLayout,
  type MindLayoutId,
  type MindSide,
} from "./mind-layout";

import { assertMindOutlineDepth, type MindOutline } from "./mind-markdown";
import { WHITEBOARD_LIMITS } from "@tau/collaboration";
import { resolveSummaryCollisions } from "./mind-layout/summary-collisions";

const MIND_DRAG_TARGET_RETENTION_SCALE = 1.2;

/** 去掉正文节点的协作 id，副本写入时重新分配 */
const stripTextIdentity = (nodes: Descendant[]): Descendant[] =>
  nodes.map(node => {
    if (!node || typeof node !== "object" || !("children" in node)) return node;
    const { collabId: _id, ...rest } = node as typeof node & Record<string, unknown>;
    return { ...rest, children: stripTextIdentity(node.children as Descendant[]) } as Descendant;
  });

export class MindUtil {
  static isRoot(node: MindNodeElement) {
    return node.level === 1;
  }

  /** 按根节点上的 layout 重排整棵树；未知布局回落思维导图 */
  static layout(node: MindNodeElement): MindNodeElement {
    return produce(node, draft => {
      const layout = getMindLayout(draft);
      reconcileRanges(draft, layout.sides.length > 1);
      normalizeTree(draft, layout.sides.length === 1);
      layout.place(draft);
      resolveSummaryCollisions(draft, layout);
    });
  }

  static visibleChildren(node: MindNodeElement) {
    return visibleChildren(node);
  }

  /** 可见且不是概要的子节点：兄弟导航、拖拽插入位置只在这一组里算 */
  static stackChildren(node: MindNodeElement) {
    return stackChildren(node);
  }

  static isSummary(node: MindNodeElement) {
    return isSummary(node);
  }

  /**
   * nodes 是同一父节点下、同一侧、连续相邻（不计概要）的兄弟时返回父节点和首尾，否则 null。
   * 单个节点也算；根节点和概要节点不能被括住。
   */
  static adjacentSiblings(root: MindNodeElement, ids: readonly string[]) {
    if (!ids.length) return null;
    const parent = this.findParentInTree(root, ids[0]);
    if (!parent) return null;
    const bothSides = getMindLayout(root).sides.length > 1;
    const picked = parent.children.filter(child => ids.includes(child.id));
    if (picked.length !== new Set(ids).size || picked.some(isSummary)) return null;
    const group = parent.children.filter(
      child => !isSummary(child) && (!bothSides || child.direction === picked[0].direction)
    );
    const indexes = picked.map(child => group.indexOf(child)).sort((a, b) => a - b);
    if (indexes[0] < 0 || indexes.some((index, i) => index !== indexes[0] + i)) return null;
    return { parent, first: group[indexes[0]], last: group[indexes[indexes.length - 1]] };
  }

  /** 给相邻兄弟加概要节点（插在同组最后一个概要之后）；返回新树和概要节点 id */
  static addSummary(root: MindNodeElement, ids: readonly string[], text: Descendant[]) {
    const range = this.adjacentSiblings(root, ids);
    if (!range) return null;
    const existing = range.parent.children.find(
      child =>
        child.summaryRange?.startId === range.first.id && child.summaryRange.endId === range.last.id
    );
    if (existing) return { root, summaryId: existing.id };
    const summary: MindNodeElement = {
      ...this.nodesFromOutline([{ text, children: [] }])[0],
      direction: range.first.direction,
      summaryRange: { startId: range.first.id, endId: range.last.id },
    };
    const next = produce(root, draft => {
      const parent = this.findNodeInTree(draft, range.parent.id)!;
      parent.children.push(summary);
    });
    return { root: this.layout(next), summaryId: summary.id };
  }

  /** 给相邻兄弟加外框；返回新树和外框 id */
  static addBoundary(root: MindNodeElement, ids: readonly string[]) {
    const range = this.adjacentSiblings(root, ids);
    if (!range) return null;
    const id = uuid();
    const next = produce(root, draft => {
      const parent = this.findNodeInTree(draft, range.parent.id)!;
      parent.boundaries = [
        ...(parent.boundaries ?? []),
        { id, startId: range.first.id, endId: range.last.id },
      ];
    });
    return { root: this.layout(next), boundaryId: id };
  }

  static findBoundary(root: MindNodeElement, boundaryId: string) {
    let found: { parent: MindNodeElement; index: number } | null = null;
    this.dfs(root, {
      before: node => {
        const index = node.boundaries?.findIndex(boundary => boundary.id === boundaryId) ?? -1;
        if (!found && index >= 0) found = { parent: node, index };
      },
    });
    return found as { parent: MindNodeElement; index: number } | null;
  }

  /** 改外框标题；title 为 undefined 时删除标题 */
  static updateBoundary(root: MindNodeElement, boundaryId: string, title: string | undefined) {
    const found = this.findBoundary(root, boundaryId);
    if (!found) return null;
    return this.layout(
      produce(root, draft => {
        const parent = this.findNodeInTree(draft, found.parent.id)!;
        const boundary = parent.boundaries![found.index];
        if (title) boundary.title = title;
        else delete boundary.title;
      })
    );
  }

  static removeBoundary(root: MindNodeElement, boundaryId: string) {
    const found = this.findBoundary(root, boundaryId);
    if (!found) return null;
    return this.layout(
      produce(root, draft => {
        const parent = this.findNodeInTree(draft, found.parent.id)!;
        parent.boundaries!.splice(found.index, 1);
        if (!parent.boundaries!.length) delete parent.boundaries;
      })
    );
  }

  /** 外框/概要括住的兄弟在 parent 下的首尾节点 */
  static rangeNodes(root: MindNodeElement, parent: MindNodeElement, range: MindRange) {
    return rangeNodes(parent, range, getMindLayout(root).sides.length > 1);
  }

  /** 换一种布局重排后的各节点位置，供悬停预览渲染（不写文档） */
  static previewLayout(root: MindNodeElement, layout: MindLayoutId) {
    const nodes = new Map<string, MindNodeElement>();
    this.dfs(this.layout({ ...root, layout }), { before: node => void nodes.set(node.id, node) });
    return { layout, nodes };
  }

  /** 单向布局里节点的子分支只有一组，左右两个折叠标记一起读写 */
  static isFolded(layout: MindLayout, node: MindNodeElement, side: MindSide) {
    if (layout.sides.length > 1)
      return Boolean(side === "left" ? node.isLeftFold : node.isRightFold);
    return Boolean(node.isLeftFold && node.isRightFold);
  }

  static relayoutAffectedRootsAfterMindMove(
    board: Board,
    movedMindNodeId: string,
    sourceRootId?: string | null
  ) {
    const latestMoved = BoardUtil.getElementById(board, movedMindNodeId) as MindNodeElement | null;
    if (!latestMoved) return;

    // 最新的目标根节点
    const targetRoot = MindUtil.getRoot(board, latestMoved);
    if (targetRoot) {
      const laidOut = MindUtil.layout(targetRoot);
      const targetRootPath = PathUtil.getPathByElement(board, targetRoot);
      if (targetRootPath) {
        const ops = BoardUtil.diffNode(targetRoot, laidOut, targetRootPath);
        BoardUtil.normalizeOperations(ops);
        board.apply(ops, true);
      }
    }

    // 旧的源根节点（若与目标根不同）
    if (sourceRootId && (!targetRoot || targetRoot.id !== sourceRootId)) {
      const latestSourceRoot = BoardUtil.getElementById(
        board,
        sourceRootId
      ) as MindNodeElement | null;
      if (latestSourceRoot) {
        const relaid = MindUtil.layout(latestSourceRoot);
        const sourceRootPath = PathUtil.getPathByElement(board, latestSourceRoot);
        if (sourceRootPath) {
          const ops = BoardUtil.diffNode(latestSourceRoot, relaid, sourceRootPath);
          BoardUtil.normalizeOperations(ops);
          board.apply(ops, true);
        }
      }
    }
  }

  /** 可见子树（跳过折叠分支）的包围盒；与 MindPlugin.getBounds 同一规则 */
  static getSubtreeBounds(node: MindNodeElement): ElementBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    this.dfs(
      node,
      {
        before: current => {
          minX = Math.min(minX, current.x);
          minY = Math.min(minY, current.y);
          maxX = Math.max(maxX, current.x + current.width);
          maxY = Math.max(maxY, current.y + current.height);
        },
      },
      null,
      0,
      true
    );

    if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
      return {
        minX: node.x,
        minY: node.y,
        maxX: node.x + node.width,
        maxY: node.y + node.height,
      };
    }

    return { minX, minY, maxX, maxY };
  }

  static dfs(
    node: MindNodeElement,
    {
      before,
      after,
    }: {
      before?: (node: MindNodeElement, parent: MindNodeElement | null, index: number) => void;
      after?: (node: MindNodeElement, parent: MindNodeElement | null, index: number) => void;
    },
    parent: MindNodeElement | null = null,
    index = 0,
    skipFolded = false
  ) {
    before?.(node, parent, index);
    // skipFolded 只跳过被收起那一侧的子节点，另一侧照常遍历
    const childrenToVisit = skipFolded ? visibleChildren(node) : (node.children ?? []);
    childrenToVisit.forEach((child, childIndex) => {
      this.dfs(child, { before, after }, node, childIndex, skipFolded);
    });
    after?.(node, parent, index);
  }

  static moveAll(root: MindNodeElement, dx: number, dy: number) {
    return produce(root, draft => {
      this.dfs(draft, {
        before: node => {
          node.x += dx;
          node.y += dy;
        },
      });
    });
  }

  static createRootDragLayout(
    root: MindNodeElement,
    position: { x: number; y: number },
    direction: "left" | "right" | null
  ) {
    const movedRoot = this.moveAll(root, position.x - root.x, position.y - root.y);
    if (!direction) return movedRoot;

    const directedRoot = produce(movedRoot, draft => {
      this.updateNodeDirectionAndLevel(draft, direction, 0);
    });
    return this.layout(directedRoot);
  }

  static getParent(root: MindNodeElement, node: MindNodeElement): MindNodeElement | null {
    let parent: MindNodeElement | null = null;

    this.dfs(root, {
      before: currentNode => {
        if (parent) return;
        if (currentNode.children.some(child => child.id === node.id)) {
          parent = currentNode;
        }
      },
    });

    return parent;
  }

  static getRoot(board: Board, node: MindNodeElement): MindNodeElement | null {
    const roots: MindNodeElement[] = [];

    BoardUtil.dfs(board, currentNode => {
      if (currentNode.type === "mind-node" && currentNode.level === 1) {
        roots.push(currentNode as MindNodeElement);
      }
    });

    if (roots.length === 0) return null;

    let root: MindNodeElement | null = null;
    for (let i = 0; i < roots.length; i++) {
      const currentRoot = roots[i];
      this.dfs(currentRoot, {
        before: currentNode => {
          if (root) return;
          if (currentNode.id === node.id) {
            root = currentRoot;
          }
        },
      });
      if (root) break;
    }

    return root;
  }

  static addChild(
    root: MindNodeElement,
    node: MindNodeElement,
    afterNode?: MindNodeElement,
    newChild?: MindNodeElement,
    fontSize = 13
  ) {
    const lineHeight = fontSize * 1.57;
    const totalHeight = lineHeight + 16 * 2;
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current, parent) => {
          if (node.id !== current.id) return;

          const child: MindNodeElement = newChild || {
            id: uuid(),
            type: "mind-node",
            // x 和 y 不重要，因为 layout 会算出来
            x: 0,
            y: 0,
            width: 24,
            height: totalHeight,
            actualHeight: totalHeight,
            level: current.level + 1,
            childrenHeight: 0,
            leftChildrenHeight: 0,
            rightChildrenHeight: 0,
            // 如果有 afterNode，说明是添加兄弟节点，应该继承 afterNode 的 direction
            // 否则根据父节点层级决定 direction
            direction: afterNode
              ? afterNode.direction
              : current.level === 1
                ? "right"
                : parent?.direction || "right",
            text: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "formatted",
                    text: "",
                  },
                ],
              },
            ],
            children: [],
            defaultFocus: true,
            isLeftFold: false,
            isRightFold: false,
          };

          if (afterNode) {
            const index = current.children.findIndex(child => child.id === afterNode.id);
            if (index !== -1) {
              current.children.splice(index + 1, 0, child);
            } else {
              current.children.push(child);
            }
          } else {
            current.children.push(child);
          }
        },
      });
    });

    return this.layout(newRoot);
  }

  /**
   * 为根节点添加指定方向的子节点
   */
  static addChildWithDirection(
    root: MindNodeElement,
    node: MindNodeElement,
    direction: "left" | "right",
    fontSize = 13
  ) {
    const lineHeight = fontSize * 1.57;
    const totalHeight = lineHeight + 16 * 2;
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          if (node.id !== current.id) return;

          const child: MindNodeElement = {
            id: uuid(),
            type: "mind-node",
            x: 0,
            y: 0,
            width: 24,
            height: totalHeight,
            actualHeight: totalHeight,
            level: current.level + 1,
            childrenHeight: 0,
            leftChildrenHeight: 0,
            rightChildrenHeight: 0,
            direction: direction,
            text: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "formatted",
                    text: "",
                  },
                ],
              },
            ],
            children: [],
            defaultFocus: true,
            isLeftFold: false,
            isRightFold: false,
          };

          current.children.push(child);
        },
      });
    });

    return this.layout(newRoot);
  }

  static addChildBefore(
    root: MindNodeElement,
    node: MindNodeElement,
    beforeNode?: MindNodeElement,
    newChild?: MindNodeElement
  ) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current, parent) => {
          if (node.id !== current.id) return;
          const child: MindNodeElement = newChild || {
            id: uuid(),
            type: "mind-node",
            // x 和 y 不重要，因为 layout 会算出来
            x: 0,
            y: 0,
            width: 24,
            height: 40,
            actualHeight: 40,
            level: current.level + 1,
            childrenHeight: 0,
            leftChildrenHeight: 0,
            rightChildrenHeight: 0,
            // 如果有 beforeNode，说明是添加兄弟节点，应该继承 beforeNode 的 direction
            // 否则根据父节点层级决定 direction
            direction: beforeNode
              ? beforeNode.direction
              : current.level === 1
                ? "right"
                : parent?.direction || "right",
            text: [
              {
                type: "paragraph",
                children: [
                  {
                    type: "formatted",
                    text: "",
                  },
                ],
              },
            ],
            children: [],
            defaultFocus: true,
            isLeftFold: false,
            isRightFold: false,
          };
          if (beforeNode) {
            const index = current.children.findIndex(child => child.id === beforeNode.id);
            if (index !== -1) {
              current.children.splice(index, 0, child);
            } else {
              current.children.push(child);
            }
          } else {
            current.children.unshift(child);
          }
        },
      });
    });
    return this.layout(newRoot);
  }

  static addSibling(
    root: MindNodeElement,
    node: MindNodeElement,
    newSibling?: MindNodeElement,
    fontSize = 13
  ) {
    const parent = this.getParent(root, node);
    if (!parent) return;
    return this.addChild(root, parent, node, newSibling, fontSize);
  }

  static addSiblingBefore(
    root: MindNodeElement,
    node: MindNodeElement,
    newSibling?: MindNodeElement
  ) {
    const parent = this.getParent(root, node);
    if (!parent) return;
    return this.addChildBefore(root, parent, node, newSibling);
  }

  static deleteNode(root: MindNodeElement, node: MindNodeElement) {
    return this.deleteNodes(root, [node]);
  }

  /** 删除节点；括住它们的概要与外框收缩到剩下的区间，整段删光时一并移除 */
  static deleteNodes(root: MindNodeElement, nodes: MindNodeElement[]) {
    const bothSides = getMindLayout(root).sides.length > 1;
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          const removed = new Set(
            nodes.map(node => node.id).filter(id => current.children.some(child => child.id === id))
          );
          if (!removed.size) return;
          shrinkRangesBeforeRemoval(current, removed, bothSides);
          current.children = current.children.filter(child => !removed.has(child.id));
        },
      });
    });
    return this.layout(newRoot);
  }

  static getChildrenByNode(node: MindNodeElement) {
    const children: MindNodeElement[] = [];
    this.dfs(
      node,
      {
        before: current => {
          if (current === node) return;
          children.push(current);
        },
      },
      null,
      0,
      false
    ); // Don't skip folded nodes for counting
    return children;
  }

  static moveNodeUp(root: MindNodeElement, node: MindNodeElement): MindNodeElement | null {
    const parent = this.getParent(root, node);
    if (!parent) return null;

    const currentIndex = parent.children.findIndex(child => child.id === node.id);
    if (currentIndex <= 0) return null;

    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          if (current.id === parent.id) {
            const [movedNode] = current.children.splice(currentIndex, 1);
            current.children.splice(currentIndex - 1, 0, movedNode);
          }
        },
      });
    });
    return this.layout(newRoot);
  }

  static moveNodeDown(root: MindNodeElement, node: MindNodeElement): MindNodeElement | null {
    const parent = this.getParent(root, node);
    if (!parent) return null;

    const currentIndex = parent.children.findIndex(child => child.id === node.id);
    if (currentIndex === -1 || currentIndex >= parent.children.length - 1) return null; // Already last or not found

    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          if (current.id === parent.id) {
            const [movedNode] = current.children.splice(currentIndex, 1);
            current.children.splice(currentIndex + 1, 0, movedNode);
          }
        },
      });
    });

    return this.layout(newRoot);
  }

  static toggleFold(root: MindNodeElement, node: MindNodeElement, direction: "left" | "right") {
    const layout = getMindLayout(root);
    const newRoot = produce(root, draft => {
      const current = this.findNodeInTree(draft, node.id);
      if (!current) return;
      if (layout.sides.length > 1) {
        if (direction === "left") current.isLeftFold = !current.isLeftFold;
        else current.isRightFold = !current.isRightFold;
        return;
      }
      const fold = !this.isFolded(layout, current, direction);
      current.isLeftFold = fold;
      current.isRightFold = fold;
    });
    return this.layout(newRoot);
  }

  static calculateDragTargetDistance(
    draggedNode: MindNodeElement,
    candidateParent: MindNodeElement,
    direction: "left" | "right",
    zoom: number,
    layout: MindLayout = getMindLayout(null)
  ): Omit<MindDragTarget, "node" | "insertIndex"> | null {
    return layout.dropDistance(draggedNode, candidateParent, direction, zoom);
  }

  /**
   * 递归更新节点及其所有子节点的 direction
   */
  static updateNodeDirectionAndLevel(
    node: MindNodeElement,
    newDirection: "left" | "right",
    parentLevel: number
  ) {
    node.direction = newDirection;
    node.level = parentLevel + 1;
    // Remove hardcoded color assignment - colors will be determined by theme

    node.children.forEach(child =>
      this.updateNodeDirectionAndLevel(child, newDirection, parentLevel + 1)
    );
  }

  /**
   * 检查目标节点是否是被拖拽节点的子孙节点
   * @param draggedNode 被拖拽的节点
   * @param targetNode 要检查的目标节点
   * @returns 如果目标节点是被拖拽节点的子孙节点，返回 true
   */
  static isDescendantOf(draggedNode: MindNodeElement, targetNode: MindNodeElement): boolean {
    // 递归检查所有子节点
    for (const child of draggedNode.children) {
      if (child.id === targetNode.id) {
        return true; // 找到了，是直接子节点
      }
      if (this.isDescendantOf(child, targetNode)) {
        return true; // 在子孙节点中找到了
      }
    }
    return false;
  }

  static findNearestMindNode(
    board: Board,
    dragNode: MindNodeElement,
    currentTarget: MindDragTarget | null = null
  ): MindDragTarget | null {
    const draggedNodeIds = new Set<string>();
    this.dfs(dragNode, {
      before: node => draggedNodeIds.add(node.id),
    });

    const visibleMindNodes: Array<{ node: MindNodeElement; layout: MindLayout }> = [];
    const roots: MindNodeElement[] = [];
    BoardUtil.dfs(board, element => {
      if (element.type === "mind-node" && this.isRoot(element as MindNodeElement)) {
        roots.push(element as MindNodeElement);
      }
    });

    const collectVisibleNodes = (node: MindNodeElement, layout: MindLayout) => {
      visibleMindNodes.push({ node, layout });
      visibleChildren(node).forEach(child => collectVisibleNodes(child, layout));
    };
    roots.forEach(root => collectVisibleNodes(root, getMindLayout(root)));

    let nearestTarget: MindDragTarget | null = null;
    const dragCenterPoint = {
      x: dragNode.x + dragNode.width / 2,
      y: dragNode.y + dragNode.height / 2,
    };

    visibleMindNodes.forEach(({ node, layout }) => {
      if (draggedNodeIds.has(node.id)) return;

      const directions: readonly MindSide[] = this.isRoot(node) ? layout.sides : [node.direction];

      directions.forEach(direction => {
        const distance = this.calculateDragTargetDistance(
          dragNode,
          node,
          direction,
          board.viewPort.zoom,
          layout
        );
        if (!distance) return;

        const retentionScale =
          currentTarget?.node.id === node.id && currentTarget.direction === direction
            ? MIND_DRAG_TARGET_RETENTION_SCALE
            : 1;
        if (distance.score > retentionScale) return;

        const placement = this.calculateInsertPosition(
          node,
          dragCenterPoint,
          direction,
          dragNode.id,
          layout
        );
        const target: MindDragTarget = {
          ...placement,
          ...distance,
        };

        if (
          !nearestTarget ||
          target.score < nearestTarget.score ||
          (target.score === nearestTarget.score &&
            target.verticalDistance < nearestTarget.verticalDistance)
        ) {
          nearestTarget = target;
        }
      });
    });

    return nearestTarget;
  }

  static calculateInsertPosition(
    parentNode: MindNodeElement,
    dragCenterPoint: { x: number; y: number },
    direction: "left" | "right",
    draggedNodeId?: string,
    layout: MindLayout = getMindLayout(null)
  ): Pick<MindDragTarget, "node" | "insertIndex" | "direction"> {
    const children = draggedNodeId
      ? parentNode.children.filter(child => child.id !== draggedNodeId)
      : parentNode.children;
    // 双向布局只和同侧兄弟比较；单向布局所有子节点排在同一组；概要不参与比较
    const stacked = children.filter(child => !isSummary(child));
    const group =
      layout.sides.length > 1 ? stacked.filter(child => child.direction === direction) : stacked;
    if (group.length === 0) return { node: parentNode, insertIndex: children.length, direction };

    const axis = layout.siblingAxis(parentNode.level);
    const centerOf = (node: MindNodeElement) =>
      axis === "x" ? node.x + node.width / 2 : node.y + node.height / 2;
    const pointer = axis === "x" ? dragCenterPoint.x : dragCenterPoint.y;
    const before = group.find(sibling => pointer < centerOf(sibling));
    const insertIndex = before
      ? children.indexOf(before)
      : children.indexOf(group[group.length - 1]) + 1;
    return { node: parentNode, insertIndex, direction };
  }

  static moveNodeToNewParent(
    sourceRoot: MindNodeElement,
    targetRoot: MindNodeElement,
    nodeToMove: MindNodeElement,
    newParent: MindNodeElement,
    insertIndex: number,
    direction: "left" | "right"
  ): MindNodeElement {
    return produce(targetRoot, draft => {
      if (sourceRoot.id === targetRoot.id) {
        const sourceParent = this.findParentInTree(draft, nodeToMove.id);
        if (sourceParent) {
          if (sourceParent.id === newParent.id)
            sourceParent.children = sourceParent.children.filter(
              child => child.id !== nodeToMove.id
            );
          else this.detachChild(draft, sourceParent, nodeToMove.id);
        }
      }

      const targetParentNode = this.findNodeInTree(draft, newParent.id);
      if (!targetParentNode) return;

      // 创建移动后的节点，递归更新所有子节点的 direction
      const movedNode = produce(nodeToMove, draft => {
        delete draft.summaryRange;
        this.updateNodeDirectionAndLevel(draft, direction, targetParentNode.level);
      });

      if (insertIndex === targetParentNode.children.length) {
        targetParentNode.children.push(movedNode);
      } else {
        targetParentNode.children.splice(insertIndex, 0, movedNode);
      }
    });
  }

  static moveNodeToSpecificPosition(
    sourceRoot: MindNodeElement,
    targetRoot: MindNodeElement,
    nodeToMove: MindNodeElement,
    targetParent: MindNodeElement,
    insertIndex: number,
    direction: "left" | "right"
  ): MindNodeElement {
    return produce(targetRoot, draft => {
      // 如果是同一树，先移除源节点
      if (sourceRoot.id === targetRoot.id) {
        const sourceParent = this.findParentInTree(draft, nodeToMove.id);
        if (sourceParent) {
          if (sourceParent.id === targetParent.id)
            sourceParent.children = sourceParent.children.filter(
              child => child.id !== nodeToMove.id
            );
          else this.detachChild(draft, sourceParent, nodeToMove.id);
        }
      }

      // 找到目标父节点
      const targetParentNode = this.findNodeInTree(draft, targetParent.id);
      if (!targetParentNode) {
        console.error("❌ 未找到目标父节点");
        return draft;
      }

      // 创建移动后的节点，递归更新所有子节点的 direction
      const movedNode = produce(nodeToMove, draft => {
        delete draft.summaryRange;
        this.updateNodeDirectionAndLevel(draft, direction, targetParentNode.level);
      });

      // 计算实际插入位置
      let actualInsertIndex = insertIndex;

      // 确保索引在有效范围内
      actualInsertIndex = Math.max(
        0,
        Math.min(actualInsertIndex, targetParentNode.children.length)
      );

      // 插入节点
      targetParentNode.children.splice(actualInsertIndex, 0, movedNode);
    });
  }

  /** 从父节点摘下一个子节点，区间先按删除收缩 */
  private static detachChild(root: MindNodeElement, parent: MindNodeElement, childId: string) {
    const removed = new Set([childId]);
    shrinkRangesBeforeRemoval(parent, removed, getMindLayout(root).sides.length > 1);
    parent.children = parent.children.filter(child => !removed.has(child.id));
  }

  static createNewRootNode(
    node: MindNodeElement,
    position: { x: number; y: number }
  ): MindNodeElement {
    const newRoot = produce(node, draft => {
      delete draft.summaryRange;
      draft.level = 1;
      draft.direction = "right";
      draft.x = position.x;
      draft.y = position.y;
      // 临时根节点不设置颜色，保持原有颜色
    });

    return MindUtil.layout(newRoot);
  }

  static findParentInTree(root: MindNodeElement, childId: string): MindNodeElement | null {
    let parent: MindNodeElement | null = null;

    MindUtil.dfs(root, {
      before: node => {
        if (parent) return;
        if (node.children.some(child => child.id === childId)) {
          parent = node;
        }
      },
    });

    return parent;
  }

  static findNodeInTree(root: MindNodeElement, nodeId: string): MindNodeElement | null {
    let foundNode: MindNodeElement | null = null;

    MindUtil.dfs(root, {
      before: node => {
        if (foundNode) return;
        if (node.id === nodeId) {
          foundNode = node;
        }
      },
    });

    return foundNode;
  }

  static canMoveNode(root: MindNodeElement, node: MindNodeElement): boolean {
    if (root.id === node.id) return true;
    const parent = this.findParentInTree(root, node.id);
    return parent !== null;
  }

  static isValidDrop(draggedNode: MindNodeElement, targetNode: MindNodeElement): boolean {
    if (draggedNode.id === targetNode.id) return false;

    let isDescendant = false;
    MindUtil.dfs(draggedNode, {
      before: node => {
        if (node.id === targetNode.id) {
          isDescendant = true;
        }
      },
    });

    return !isDescendant;
  }

  /** 节点有子节点且全部被收起（两侧都算） */
  static isCollapsed(node: MindNodeElement) {
    return node.children.length > 0 && visibleChildren(node).length === 0;
  }

  /** 收起或展开节点的全部子节点；两侧标记一起写，换边后不会冒出另一侧的旧折叠 */
  static setFolded(root: MindNodeElement, nodeId: string, folded: boolean) {
    return this.layout(
      produce(root, draft => {
        const node = this.findNodeInTree(draft, nodeId);
        if (!node || !node.children.length) return;
        node.isLeftFold = folded;
        node.isRightFold = folded;
      })
    );
  }

  /** 有可见子节点就全部收起，否则全部展开 */
  static toggleCollapsed(root: MindNodeElement, nodeId: string) {
    const node = this.findNodeInTree(root, nodeId);
    if (!node?.children.length) return null;
    return this.setFolded(root, nodeId, visibleChildren(node).length > 0);
  }

  /** 展开节点及其下所有层级 */
  static expandAll(root: MindNodeElement, nodeId: string) {
    return this.layout(
      produce(root, draft => {
        const node = this.findNodeInTree(draft, nodeId);
        if (!node) return;
        this.dfs(node, {
          before: current => {
            current.isLeftFold = false;
            current.isRightFold = false;
          },
        });
      })
    );
  }

  /** 整张导图展开到第 depth 层（根节点为第 1 层）；depth 为 0 时全部展开 */
  static expandToLevel(root: MindNodeElement, depth: number) {
    return this.layout(
      produce(root, draft => {
        this.dfs(draft, {
          before: node => {
            const folded = depth > 0 && node.level >= depth && node.children.length > 0;
            node.isLeftFold = folded;
            node.isRightFold = folded;
          },
        });
      })
    );
  }

  /** 树的最深层级（根节点为 1） */
  static maxLevel(root: MindNodeElement) {
    let level = 1;
    this.dfs(root, { before: node => void (level = Math.max(level, node.level)) });
    return level;
  }

  /** 升一级：变成父节点的下一个同级；父节点是根时不动 */
  static promote(root: MindNodeElement, nodeId: string) {
    const parent = this.findParentInTree(root, nodeId);
    if (!parent || this.isRoot(parent)) return null;
    const grandParent = this.findParentInTree(root, parent.id);
    if (!grandParent) return null;
    return this.layout(
      produce(root, draft => {
        const from = this.findNodeInTree(draft, parent.id)!;
        const to = this.findNodeInTree(draft, grandParent.id)!;
        const node = from.children.find(child => child.id === nodeId)!;
        this.detachChild(draft, from, nodeId);
        delete node.summaryRange;
        node.direction = from.direction;
        to.children.splice(to.children.findIndex(child => child.id === from.id) + 1, 0, node);
      })
    );
  }

  /** 复制分支放到它后面；返回新树和副本 */
  static duplicate(root: MindNodeElement, nodeId: string) {
    const node = this.findNodeInTree(root, nodeId);
    const parent = node && this.findParentInTree(root, nodeId);
    if (!node || !parent) return null;
    const copy = this.cloneSubtree(node);
    const next = produce(root, draft => {
      const target = this.findNodeInTree(draft, parent.id)!;
      target.children.splice(target.children.findIndex(child => child.id === nodeId) + 1, 0, copy);
    });
    return { root: this.layout(next), copy };
  }

  /**
   * 子树的独立副本：换新 id，正文取协作投影的 body（没有时取 text）并去掉协作 id，
   * 关联笔记的引用保留。
   */
  static cloneSubtree(node: MindNodeElement): MindNodeElement {
    return this.cloneSubtrees([node])[0];
  }

  private static cloneSubtrees(nodes: MindNodeElement[]): MindNodeElement[] {
    const ids = new Map<string, string>();
    nodes.forEach(node =>
      this.dfs(node, { before: current => void ids.set(current.id, uuid()) }, null, 0, false)
    );
    const remap = <T extends { startId: string; endId: string }>(range: T): T => ({
      ...range,
      startId: ids.get(range.startId) ?? range.startId,
      endId: ids.get(range.endId) ?? range.endId,
    });
    const clone = (current: MindNodeElement): MindNodeElement => {
      const copy = this.cloneNode(current, ids.get(current.id)!, clone);
      if (current.summaryRange) copy.summaryRange = remap(current.summaryRange);
      if (current.boundaries)
        copy.boundaries = current.boundaries.map(boundary => ({ ...remap(boundary), id: uuid() }));
      return copy;
    };
    return nodes.map(clone);
  }

  private static cloneNode(
    node: MindNodeElement,
    id: string,
    cloneChild: (child: MindNodeElement) => MindNodeElement
  ): MindNodeElement {
    const {
      body,
      dataVersion: _version,
      defaultFocus: _focus,
      ...rest
    } = node as MindNodeElement & Record<string, unknown>;
    return {
      ...rest,
      id,
      text: stripTextIdentity(Array.isArray(body) ? (body as Descendant[]) : (node.text ?? [])),
      children: node.children.map(cloneChild),
    } as MindNodeElement;
  }

  /**
   * 把若干子树的副本挂到 parentId 下（追加在末尾）并展开父节点，方向与层级随新父节点重算。
   * 返回新树和挂上去的副本。
   */
  static attachSubtrees(root: MindNodeElement, parentId: string, subtrees: MindNodeElement[]) {
    const parent = this.findNodeInTree(root, parentId);
    if (!parent || !subtrees.length) return null;
    const direction: "left" | "right" = this.isRoot(parent) ? "right" : parent.direction;
    const attached = this.cloneSubtrees(subtrees).map(subtree =>
      produce(subtree, draft => {
        this.updateNodeDirectionAndLevel(draft, direction, parent.level);
      })
    );
    const next = produce(root, draft => {
      const target = this.findNodeInTree(draft, parentId)!;
      target.isLeftFold = false;
      target.isRightFold = false;
      target.children.push(...attached);
    });
    return { root: this.layout(next), attached };
  }

  /** 大纲 → 导图节点（坐标由布局算，宽度等文字测量后再重排） */
  static nodesFromOutline(
    outline: readonly MindOutline[],
    fontSize = 13,
    maxDepth = WHITEBOARD_LIMITS.payloadDepth - 1
  ): MindNodeElement[] {
    assertMindOutlineDepth(outline, maxDepth);
    const height = fontSize * 1.57 + 16 * 2;
    const build = (item: MindOutline): MindNodeElement => ({
      id: uuid(),
      type: "mind-node",
      x: 0,
      y: 0,
      width: 24,
      height,
      actualHeight: height,
      level: 2,
      childrenHeight: 0,
      leftChildrenHeight: 0,
      rightChildrenHeight: 0,
      direction: "right",
      text: item.text,
      children: item.children.map(build),
      isLeftFold: false,
      isRightFold: false,
    });
    return outline.map(build);
  }

  /** 导图子树 → 大纲（含收起的分支，不含概要） */
  static toOutline(node: MindNodeElement): MindOutline {
    return {
      text: node.text,
      children: node.children
        .filter(child => !isSummary(child))
        .map(child => this.toOutline(child)),
    };
  }

  static getDefaultThemeId(): string {
    return MindThemeUtil.getDefaultThemeId();
  }
}

export default MindUtil;
