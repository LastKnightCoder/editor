import { Board, BoardElement, MindNodeElement, Operation } from "../types";
import { MindUtil } from "./MindUtil";
import { PathUtil } from "./PathUtil";
import { BoardUtil } from "./BoardUtil";
import { isValid } from "./common";
import { ColumnUtil } from "./ColumnUtil";
import { deleteRichTextContent, isRichTextContentEmpty } from "./RichTextContentUtil";
import type { ColumnElement } from "../types/column";
import type { RichTextElement } from "../plugins/RichTextPlugin";

export const deleteBoardElements = (board: Board, elements: BoardElement[]): boolean => {
  if (elements.length === 0) return false;

  const selectedIds = new Set(elements.map(element => element.id));

  const mindNodes = elements.filter(element => element.type === "mind-node") as MindNodeElement[];

  const roots = mindNodes
    .map(node => {
      const root = MindUtil.getRoot(board, node);
      if (!root) return null;
      return {
        root,
        node,
      };
    })
    .filter(isValid);

  const rootsMap = new Map<MindNodeElement, MindNodeElement[]>();
  roots.forEach(({ root, node }) => {
    if (!rootsMap.has(root)) {
      rootsMap.set(root, []);
    }
    rootsMap.get(root)?.push(node);
  });

  const mindOps: Operation[] = [];
  const rootsToDelete: MindNodeElement[] = [];

  rootsMap.forEach((nodes, root) => {
    const rootPath = PathUtil.getPathByElement(board, root);
    if (!rootPath) return;
    if (selectedIds.has(root.id)) {
      rootsToDelete.push(root);
    } else {
      const newRoot = MindUtil.deleteNodes(root, nodes);
      mindOps.push(...BoardUtil.diffNode(root, newRoot, rootPath));
    }
  });

  const otherElements = elements.filter(element => element.type !== "mind-node");

  const deleteTargets = [...otherElements, ...rootsToDelete];
  const ops: Operation[] = [];
  for (const element of deleteTargets) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) continue;
    ops.push({
      type: "remove_node",
      path,
      node: element,
    });
  }

  const finalOps = [...mindOps, ...ops];
  if (finalOps.length === 0) {
    return false;
  }

  // mindOps 来自 diffNode：需要跳过路径变换并按顺序执行，因此必须标记为 normalized。
  BoardUtil.normalizeOperations(mindOps);
  board.apply(finalOps);
  return true;
};

/**
 * 空白富文本失焦即回收：新建后一个字没打就点走的元素不留在画布上。
 * 仅处理 richtext（card 指向已有卡片），已建过卡片 / 文章的不动；
 * 在列内时先记住父列，删完再按最新状态重排。
 */
export const deleteEmptyRichText = (board: Board, element: BoardElement): boolean => {
  const richText = element as RichTextElement;
  if (richText.type !== "richtext") return false;
  if (richText.readonly || richText.linkedCardId || richText.linkedArticleId) return false;
  if (!isRichTextContentEmpty(richText.content)) return false;

  const latest = BoardUtil.getElementById(board, richText.id) as RichTextElement | null;
  if (!latest || !isRichTextContentEmpty(latest.content)) return false;
  const path = PathUtil.getPathByElement(board, latest);
  if (!path) return false;

  const parentColumn = ColumnUtil.findParentColumn(board, latest);
  board.apply({ type: "remove_node", path, node: latest });
  if (parentColumn) {
    const latestColumn = BoardUtil.getElementById(board, parentColumn.id) as ColumnElement | null;
    if (latestColumn) ColumnUtil.relayout(board, latestColumn);
  }
  void deleteRichTextContent(latest.contentId);
  return true;
};

export default deleteBoardElements;
