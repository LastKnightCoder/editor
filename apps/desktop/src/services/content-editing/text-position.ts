import { Element, Text, type Descendant } from "slate";
import { offsetToMarkdownPoint } from "./snapshot";
import type { ContentSnapshot } from "./types";

export function resolveTextPoint(snapshot: ContentSnapshot, offset: number) {
  const markdown = offsetToMarkdownPoint(offset, snapshot.lineOffsets);
  const point = snapshot.positionMap.markdownToSlate(markdown);
  if (!point || point.path.length < 2 || !point.path.every(Number.isSafeInteger)) return;
  const mapped = snapshot.positionMap.slateToMarkdown(point);
  if (mapped?.line !== markdown.line || mapped.ch !== markdown.ch) return;
  let parent: Descendant | undefined = snapshot.content[point.path[0]];
  for (const index of point.path.slice(1, -1))
    parent = Element.isElement(parent) ? parent.children[index] : undefined;
  const index = point.path[point.path.length - 1];
  if (!Element.isElement(parent) || !("collabId" in parent) || typeof parent.collabId !== "string")
    return;
  const leaf = parent.children[index];
  if (!Text.isText(leaf) || point.offset > leaf.text.length) return;
  return {
    id: parent.collabId,
    path: point.path,
    leafOffset: point.offset,
    offset: parent.children
      .slice(0, index)
      .reduce(
        (length, child) => length + (Text.isText(child) ? child.text.length : 1),
        point.offset
      ),
  };
}
