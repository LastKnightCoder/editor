import { v4 as uuid } from 'uuid';
import BoardUtil from "./BoardUtil.ts";
import { Board, MindNodeElement } from "../types";
import {
  MIND_COLORS,
  MIND_LINE_COLORS,
} from "@/components/WhiteBoard/constants";
import { produce } from "immer";

const MARGIN_X = 36;

const MARGIN_Y: Record<string, number> = {
  "1": 24,
  "2": 16,
  "3": 8
}

export class MindUtil {
  static isRoot(node: MindNodeElement) {
    return node.level === 1;
  }

  static layout(node: MindNodeElement): MindNodeElement {
    return produce(node, draft => {
      this.dfs(draft, {
        before: (node, parent) => {
          if (parent) {
            node.x = parent.x + parent.width + MARGIN_X;
          }
        },
        after: (node) => {
          if (node.children.length > 0) {
            node.childrenHeight = node.children.reduce((pre, cur) => {
              return pre + cur.actualHeight;
            }, 0) + (node.children.length - 1) * (MARGIN_Y[node.level + 1] || 8);
            node.actualHeight = Math.max(node.childrenHeight, node.height);
          } else {
            node.actualHeight = node.height;
            node.childrenHeight = 0;
          }
        }
      })

      this.dfs(draft, {
        before: (node, parent, index) => {
          if (!parent) return;

          const beforeSiblings = index > 0 ? parent.children.slice(0, index) : [];
          const siblingsHeight = beforeSiblings.reduce((pre, cur) => {
            return pre + cur.actualHeight;
          }, 0) + beforeSiblings.length * (MARGIN_Y[node.level] || 8);
          const baseY = parent.y + parent.height / 2 - parent.childrenHeight / 2;
          const childrenTop = baseY + siblingsHeight;
          node.y = childrenTop + (node.actualHeight - node.height) / 2;
        }
      })
    })
  }

  static dfs(node: MindNodeElement, {
    before,
    after,
  }: {
    before?: (node: MindNodeElement, parent: MindNodeElement | null, index: number) => void;
    after?: (node: MindNodeElement, parent: MindNodeElement | null, index: number) => void
  }, parent: MindNodeElement | null = null, index = 0) {
    before?.(node, parent, index);
    node.children.forEach((child, index) => {
      this.dfs(child, {
        before,
        after,
      }, node, index);
    });
    after?.(node, parent, index);
  }

  static moveAll(root: MindNodeElement, dx: number, dy: number) {
    return produce(root, draft => {
      this.dfs(draft, {
        before: (node) => {
          node.x += dx;
          node.y += dy;
        }
      })
    })
  }

  static getParent(root: MindNodeElement, node: MindNodeElement): MindNodeElement | null {
    let parent: MindNodeElement | null = null;

    this.dfs(root, {
      before: (currentNode) => {
        if (parent) return;
        if (currentNode.children.some((child) => child.id === node.id)) {
          parent = currentNode;
        }
      }
    });

    return parent;
  }

  static getRoot(board: Board, node: MindNodeElement): MindNodeElement | null {
    const roots: MindNodeElement[] = [];

    BoardUtil.dfs(board, (currentNode) => {
      if (currentNode.type === 'mind-node' && currentNode.level === 1) {
        roots.push(currentNode as MindNodeElement);
      }
    });

    if (roots.length === 0) return null;

    let root: MindNodeElement | null = null;
    for (let i = 0; i < roots.length; i++) {
      const currentRoot = roots[i];
      this.dfs(currentRoot, {
        before: (currentNode) => {
          if (root) return;
          if (currentNode.id === node.id) {
            root = currentRoot;
          }
        }
      });
      if (root) break;
    }

    return root;
  }

  static addChild(root: MindNodeElement, node: MindNodeElement, afterNode?: MindNodeElement, newChild?: MindNodeElement) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current) => {
          if (node.id !== current.id) return;

          const child: MindNodeElement = newChild || {
            id: uuid(),
            type: 'mind-node',
            // x 和 y 不重要，因为 layout 会算出来
            x: 0,
            y: 0,
            width: 24,
            height: 48,
            actualHeight: 48,
            level: current.level + 1,
            childrenHeight: 0,
            direction: 'right',
            text: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'formatted',
                    text: '',
                  }
                ]
              }
            ],
            ...(MIND_COLORS[current.level] || MIND_COLORS[MIND_LINE_COLORS.length - 1]),
            border: 'transparent',
            children: [],
            defaultFocus: true,
          }

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
        }
      });
    });

    return this.layout(newRoot);
  }

  static addChildBefore(root: MindNodeElement, node: MindNodeElement, beforeNode?: MindNodeElement, newChild?: MindNodeElement) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current) => {
          if (node.id !== current.id) return;
          const child: MindNodeElement = newChild || {
            id: uuid(),
            type: 'mind-node',
            // x 和 y 不重要，因为 layout 会算出来
            x: 0,
            y: 0,
            width: 24,
            height: 48,
            actualHeight: 48,
            level: current.level + 1,
            childrenHeight: 0,
            direction: 'right',
            text: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'formatted',
                    text: '',
                  }
                ]
              }
            ],
            ...(MIND_COLORS[current.level] || MIND_COLORS[MIND_LINE_COLORS.length - 1]),
            border: 'transparent',
            children: [],
            defaultFocus: true,
          }
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
        }
      })
    });
    return this.layout(newRoot);
  }

  static addSibling(root: MindNodeElement, node: MindNodeElement, newSibling?: MindNodeElement) {
    const parent = this.getParent(root, node);
    if (!parent) return;
    return this.addChild(root, parent, node, newSibling);
  }

  static addSiblingBefore(root: MindNodeElement, node: MindNodeElement, newSibling?: MindNodeElement) {
    const parent = this.getParent(root, node);
    if (!parent) return;
    return this.addChildBefore(root, parent, node, newSibling);
  }

  static deleteNode(root: MindNodeElement, node: MindNodeElement) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current) => {
          const childIndex = current.children.findIndex(child => child.id === node.id);
          if (childIndex !== -1) {
            current.children.splice(childIndex, 1);
          }
        }
      });
    });
    return this.layout(newRoot);
  }

  static deleteNodes(root: MindNodeElement, nodes: MindNodeElement[]) {
    const newRoot = produce(root, draft => {
      this.dfs(draft, {
        before: (current) => {
          nodes.forEach(node => {
            const childIndex = current.children.findIndex(child => child.id === node.id);
            if (childIndex !== -1) {
              current.children.splice(childIndex, 1);
            }
          });
        }
      });
    })
    return this.layout(newRoot);
  }
}

export default MindUtil;
