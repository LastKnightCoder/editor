/**
 * 洞见里的「连接」：把正文里 AI 指出的那几个字包成指向对方的 content-link（与手动加链接同一种节点，
 * 协作、撤销、引用索引都照常）。片段跨格式叶子时整段包进一个链接，叶子的格式保留在链接里。
 */

import { Editor, Element, Transforms } from "slate";
import type { ContentLinkElement } from "@/editor-extensions/content-link/types";
import type { InsightMark } from "@/types/content-insights";
import { anchorSpan } from "./anchors";

/** 成功返回 true；正文已改、找不到原文片段或片段已在链接里时返回 false */
export function connectInsightMark(editor: Editor, mark: InsightMark): boolean {
  const target = mark.target;
  if (!target || !mark.anchor) return false;
  const range = anchorSpan(editor, mark.block, mark.anchor);
  if (!range) return false;
  const inLink = Editor.above(editor, {
    at: range.anchor,
    match: node => Element.isElement(node) && node.type === "content-link",
  });
  if (inLink) return false;
  const link: Omit<ContentLinkElement, "children"> & { children: [] } = {
    type: "content-link",
    refId: target.ref.id,
    contentId: target.contentId,
    contentType: target.ref.kind,
    contentTitle: target.title,
    children: [],
  };
  Transforms.wrapNodes(editor, link as unknown as Element, { at: range, split: true });
  return true;
}
