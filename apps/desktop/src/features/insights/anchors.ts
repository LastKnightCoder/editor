/**
 * 洞见标记在编辑器里的定位（纯函数）：主进程给的是「顶层块序号 + 原文片段」，这里把片段换成 Slate Range。
 *
 * 片段可能跨多个文字叶子（中间有加粗等格式），按块内文字叶子顺序拼接后查找，再拆回各叶子的 Range。
 * 正文改动后找不到的片段直接不显示（主进程分析时已核对过，找不到说明正文变了）。
 */

import { Element, Node, Text, type Descendant, type Editor, type Path, type Range } from "slate";
import type { InsightMark } from "@/types/content-insights";

export interface InsightRangeProps {
  insightId: string;
  insightKind: InsightMark["kind"];
  /** 按正文顺序的序号，画线动画依次延迟 */
  insightOrder: number;
}

type LeafRange = Range & InsightRangeProps;

/** 块里每个文字叶子的路径与在拼接文字里的起点 */
function textsOf(block: Descendant, blockIndex: number) {
  const parts: Array<{ path: Path; start: number; text: string }> = [];
  let offset = 0;
  if (Text.isText(block)) return parts;
  for (const [node, relative] of Node.texts(block)) {
    parts.push({ path: [blockIndex, ...relative], start: offset, text: node.text });
    offset += node.text.length;
  }
  return parts;
}

/** 片段在块里的 Range 列表（每个叶子一段）；找不到返回 null */
export function anchorRanges(
  children: Descendant[],
  blockIndex: number,
  anchor: string
): Range[] | null {
  return blockAnchorRanges(children[blockIndex], blockIndex, anchor);
}

function blockAnchorRanges(
  block: Node | undefined,
  blockIndex: number,
  anchor: string
): Range[] | null {
  if (!block || !anchor || !Element.isElement(block)) return null;
  const parts = textsOf(block, blockIndex);
  const full = parts.map(part => part.text).join("");
  const at = full.indexOf(anchor);
  if (at < 0) return null;
  const end = at + anchor.length;
  const ranges: Range[] = [];
  for (const part of parts) {
    const from = Math.max(at, part.start);
    const to = Math.min(end, part.start + part.text.length);
    if (from >= to) continue;
    ranges.push({
      anchor: { path: part.path, offset: from - part.start },
      focus: { path: part.path, offset: to - part.start },
    });
  }
  return ranges.length ? ranges : null;
}

/** 片段覆盖的整段 Range（连接时包成链接）；跨叶子时从第一段起点到最后一段终点 */
export function anchorSpan(editor: Editor, blockIndex: number, anchor: string): Range | null {
  const ranges = anchorRanges(editor.children, blockIndex, anchor);
  if (!ranges) return null;
  return { anchor: ranges[0].anchor, focus: ranges[ranges.length - 1].focus };
}

/** 按正文顺序排列的、需要画在字上的标记（可以展开不画在字上） */
export function orderedTextMarks(marks: InsightMark[]): InsightMark[] {
  return marks
    .filter(mark => mark.status === "open" && mark.kind !== "gap" && mark.anchor)
    .sort((a, b) => a.block - b.block);
}

/**
 * 编辑器 decorate：只在顶层块上返回 Range（Slate 会把祖先的装饰下发给覆盖到的叶子）。
 * marks 为需要画的标记，按正文顺序给出序号。片段只在 Slate 传入的块节点里找，不读编辑器实例。
 */
export function createInsightDecorate(marks: InsightMark[]) {
  const byBlock = new Map<number, Array<{ mark: InsightMark; order: number }>>();
  orderedTextMarks(marks).forEach((mark, order) => {
    const list = byBlock.get(mark.block) ?? [];
    list.push({ mark, order });
    byBlock.set(mark.block, list);
  });
  return ([node, path]: [Node, Path]): Range[] => {
    if (path.length !== 1) return [];
    const list = byBlock.get(path[0]);
    if (!list) return [];
    const result: LeafRange[] = [];
    for (const { mark, order } of list) {
      for (const range of blockAnchorRanges(node, path[0], mark.anchor) ?? []) {
        result.push({ ...range, insightId: mark.id, insightKind: mark.kind, insightOrder: order });
      }
    }
    return result;
  };
}
