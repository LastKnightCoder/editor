import { produce } from "immer";
import { v4 as uuid } from "uuid";
import BoardUtil from "./BoardUtil.ts";
import PathUtil from "./PathUtil.ts";
import { Board, MindNodeElement, MindDragTarget } from "../types";
import MindThemeUtil from "./MindThemeUtil.ts";

const MARGIN_X = 36;

export const MIND_DRAG_HORIZONTAL_THRESHOLD_PX = 120;
export const MIND_DRAG_VERTICAL_THRESHOLD_PX = 80;
export const MIND_DRAG_TARGET_RETENTION_SCALE = 1.2;

const MARGIN_Y: Record<string, number> = {
  "1": 24,
  "2": 16,
  "3": 8,
};

export class MindUtil {
  static isRoot(node: MindNodeElement) {
    return node.level === 1;
  }

  static layout(node: MindNodeElement): MindNodeElement {
    return produce(node, draft => {
      this.dfs(
        draft,
        {
          before: (node, parent) => {
            if (parent) {
              node.level = parent.level + 1;
              // Remove hardcoded color assignment - colors will be determined by theme
              if (node.level > 2) {
                node.direction = parent.direction;
              }
              // 根据 direction 计算 x 坐标
              if (node.direction === "left") {
                node.x = parent.x - node.width - MARGIN_X;
              } else {
                node.x = parent.x + parent.width + MARGIN_X;
              }
            }
          },
          after: node => {
            // 根据折叠状态过滤可见子节点
            const leftChildren = node.children.filter(child => child.direction === "left");
            const rightChildren = node.children.filter(child => child.direction === "right");

            const visibleLeftChildren = node.isLeftFold ? [] : leftChildren;
            const visibleRightChildren = node.isRightFold ? [] : rightChildren;
            const visibleChildren = [...visibleLeftChildren, ...visibleRightChildren];

            if (visibleChildren.length > 0) {
              const leftHeight =
                visibleLeftChildren.length > 0
                  ? visibleLeftChildren.reduce((pre, cur) => pre + cur.actualHeight, 0) +
                    (visibleLeftChildren.length - 1) * (MARGIN_Y[node.level + 1] || 8)
                  : 0;

              const rightHeight =
                visibleRightChildren.length > 0
                  ? visibleRightChildren.reduce((pre, cur) => pre + cur.actualHeight, 0) +
                    (visibleRightChildren.length - 1) * (MARGIN_Y[node.level + 1] || 8)
                  : 0;

              // 存储左右两边的高度，用于独立布局
              node.leftChildrenHeight = leftHeight;
              node.rightChildrenHeight = rightHeight;

              // 取左右两边的最大高度作为总的子节点高度（用于计算 actualHeight）
              node.childrenHeight = Math.max(leftHeight, rightHeight);
              node.actualHeight = Math.max(node.childrenHeight, node.height);
            } else {
              node.actualHeight = node.height;
              node.childrenHeight = 0;
              node.leftChildrenHeight = 0;
              node.rightChildrenHeight = 0;
            }
          },
        },
        null,
        0,
        true
      ); // Use skipFolded=true

      this.dfs(
        draft,
        {
          before: (node, parent) => {
            if (!parent) return;

            // 根据父节点的折叠状态和节点方向计算可见的兄弟节点
            const isNodeLeftDirection = node.direction === "left";
            const isParentFoldThisDirection = isNodeLeftDirection
              ? parent.isLeftFold
              : parent.isRightFold;

            if (isParentFoldThisDirection) return; // 如果父节点折叠了这个方向，则此节点不可见

            const parentVisibleChildren = parent.children.filter(child => {
              const isChildLeftDirection = child.direction === "left";
              const isParentFoldChildDirection = isChildLeftDirection
                ? parent.isLeftFold
                : parent.isRightFold;
              return !isParentFoldChildDirection;
            });

            // 只考虑相同 direction 的兄弟节点
            const sameDirectionSiblings = parentVisibleChildren.filter(
              child => child.direction === node.direction
            );
            const currentIndexInSameDirection = sameDirectionSiblings.findIndex(
              child => child.id === node.id
            );

            const beforeSiblingsInSameDirection =
              currentIndexInSameDirection > 0
                ? sameDirectionSiblings.slice(0, currentIndexInSameDirection)
                : [];

            const siblingsHeight =
              beforeSiblingsInSameDirection.reduce((pre, cur) => {
                return pre + cur.actualHeight;
              }, 0) +
              beforeSiblingsInSameDirection.length * (MARGIN_Y[node.level] || 8);

            // 根据节点方向使用对应的 childrenHeight 来计算 baseY
            const relevantChildrenHeight = isNodeLeftDirection
              ? parent.leftChildrenHeight
              : parent.rightChildrenHeight;

            const baseY = parent.y + parent.height / 2 - relevantChildrenHeight / 2;
            const childrenTop = baseY + siblingsHeight;
            node.y = childrenTop + (node.actualHeight - node.height) / 2;
          },
        },
        null,
        0,
        true
      );
    });
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
    const nodeChildren = node.children ?? [];
    if (!skipFolded || (!node.isLeftFold && !node.isRightFold)) {
      // 如果不跳过折叠节点，或者节点没有完全折叠，则遍历子节点
      const childrenToVisit = skipFolded
        ? nodeChildren.filter(child => {
            const isChildLeftDirection = child.direction === "left";
            const isFoldInThisDirection = isChildLeftDirection ? node.isLeftFold : node.isRightFold;
            return !isFoldInThisDirection;
          })
        : nodeChildren;

      childrenToVisit.forEach((child, index) => {
        this.dfs(
          child,
          {
            before,
            after,
          },
          node,
          index,
          skipFolded
        );
      });
    }
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
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          const childIndex = current.children.findIndex(child => child.id === node.id);
          if (childIndex !== -1) {
            current.children.splice(childIndex, 1);
          }
        },
      });
    });
    return this.layout(newRoot);
  }

  static deleteNodes(root: MindNodeElement, nodes: MindNodeElement[]) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          nodes.forEach(node => {
            const childIndex = current.children.findIndex(child => child.id === node.id);
            if (childIndex !== -1) {
              current.children.splice(childIndex, 1);
            }
          });
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
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: current => {
          if (current.id === node.id) {
            if (direction === "left") {
              current.isLeftFold = !current.isLeftFold;
            } else {
              current.isRightFold = !current.isRightFold;
            }
          }
        },
      });
    });
    return this.layout(newRoot);
  }

  static calculateDragTargetDistance(
    draggedNode: MindNodeElement,
    candidateParent: MindNodeElement,
    direction: "left" | "right",
    zoom: number
  ): Omit<MindDragTarget, "node" | "insertIndex"> | null {
    const parentLeft = candidateParent.x;
    const parentRight = candidateParent.x + candidateParent.width;
    const draggedLeft = draggedNode.x;
    const draggedRight = draggedNode.x + draggedNode.width;
    const isCompletelyOnDirectionSide =
      direction === "right" ? draggedLeft >= parentRight : draggedRight <= parentLeft;

    if (!isCompletelyOnDirectionSide) {
      return null;
    }

    const horizontalDistance =
      direction === "right" ? draggedLeft - parentRight : parentLeft - draggedRight;
    const verticalDistance = Math.max(
      0,
      candidateParent.y - (draggedNode.y + draggedNode.height),
      draggedNode.y - (candidateParent.y + candidateParent.height)
    );
    const safeZoom = Math.max(zoom, 0.01);
    const score = Math.hypot(
      (horizontalDistance * safeZoom) / MIND_DRAG_HORIZONTAL_THRESHOLD_PX,
      (verticalDistance * safeZoom) / MIND_DRAG_VERTICAL_THRESHOLD_PX
    );
    const parentCenterY = candidateParent.y + candidateParent.height / 2;
    const draggedCenterY = draggedNode.y + draggedNode.height / 2;

    return {
      direction,
      horizontalDistance,
      verticalDistance,
      score,
      connectionStart: {
        x: direction === "right" ? candidateParent.x + candidateParent.width : candidateParent.x,
        y: parentCenterY,
      },
      connectionEnd: {
        x: direction === "right" ? draggedNode.x : draggedNode.x + draggedNode.width,
        y: draggedCenterY,
      },
    };
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

    const visibleMindNodes: MindNodeElement[] = [];
    const roots: MindNodeElement[] = [];
    BoardUtil.dfs(board, element => {
      if (element.type === "mind-node" && this.isRoot(element as MindNodeElement)) {
        roots.push(element as MindNodeElement);
      }
    });

    const collectVisibleNodes = (node: MindNodeElement) => {
      visibleMindNodes.push(node);
      node.children.forEach(child => {
        const isFolded = child.direction === "left" ? node.isLeftFold : node.isRightFold;
        if (!isFolded) collectVisibleNodes(child);
      });
    };
    roots.forEach(collectVisibleNodes);

    let nearestTarget: MindDragTarget | null = null;
    const dragCenterPoint = {
      x: dragNode.x + dragNode.width / 2,
      y: dragNode.y + dragNode.height / 2,
    };

    visibleMindNodes.forEach(node => {
      if (draggedNodeIds.has(node.id)) return;

      const directions: Array<"left" | "right"> = this.isRoot(node)
        ? ["left", "right"]
        : [node.direction];

      directions.forEach(direction => {
        const distance = this.calculateDragTargetDistance(
          dragNode,
          node,
          direction,
          board.viewPort.zoom
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
          dragNode.id
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
    draggedNodeId?: string
  ): Pick<MindDragTarget, "node" | "insertIndex" | "direction"> {
    const children = draggedNodeId
      ? parentNode.children.filter(child => child.id !== draggedNodeId)
      : parentNode.children;

    if (children.length === 0) {
      return {
        node: parentNode,
        insertIndex: 0,
        direction,
      };
    }

    // 找出同侧的兄弟节点
    const sameDirectionSiblings = children.filter(child => child.direction === direction);

    // 如果没有同方向的子节点，直接插入到该方向的第一个位置
    if (sameDirectionSiblings.length === 0) {
      // 找到该方向在 children 数组中的第一个位置
      const firstIndexInDirection = children.findIndex(child => child.direction === direction);
      const insertIndex = firstIndexInDirection === -1 ? children.length : firstIndexInDirection;

      return {
        node: parentNode,
        insertIndex,
        direction,
      };
    }

    // 查找应该插入的位置
    let insertIndex = children.length; // 默认插入到最后

    // 只比较同方向的兄弟节点
    for (let i = 0; i < sameDirectionSiblings.length; i++) {
      const sibling = sameDirectionSiblings[i];
      const siblingCenterY = sibling.y + sibling.height / 2;

      if (dragCenterPoint.y < siblingCenterY) {
        // 鼠标在这个兄弟节点上方，应该插入在它之前
        // 需要找到这个兄弟节点在原始 children 数组中的索引
        const originalIndex = children.findIndex(child => child.id === sibling.id);
        insertIndex = originalIndex;
        break;
      }
    }

    // 如果鼠标在所有同方向兄弟节点下方，插入到最后一个同方向兄弟节点之后
    if (insertIndex === children.length) {
      const lastSibling = sameDirectionSiblings[sameDirectionSiblings.length - 1];
      const lastSiblingIndex = children.findIndex(child => child.id === lastSibling.id);
      insertIndex = lastSiblingIndex + 1;
    }

    return {
      node: parentNode,
      insertIndex,
      direction,
    };
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
          sourceParent.children = sourceParent.children.filter(child => child.id !== nodeToMove.id);
        }
      }

      const targetParentNode = this.findNodeInTree(draft, newParent.id);
      if (!targetParentNode) return;

      // 创建移动后的节点，递归更新所有子节点的 direction
      const movedNode = produce(nodeToMove, draft => {
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
          sourceParent.children = sourceParent.children.filter(child => child.id !== nodeToMove.id);
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

  static createNewRootNode(
    node: MindNodeElement,
    position: { x: number; y: number }
  ): MindNodeElement {
    const newRoot = produce(node, draft => {
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

  static getDefaultThemeId(): string {
    return MindThemeUtil.getDefaultThemeId();
  }
}

export default MindUtil;
