import type { NodeTree, ScopedContentEdit } from "@tau/collaboration";

/** 本机基线重建会使旧 Yjs 锚点失效；历史回看只匹配同一稳定块内唯一的已应用文字。 */
export function resolveHistoricalTextRange(
  tree: NodeTree,
  edit: Extract<ScopedContentEdit, { kind: "text" }>
) {
  if (!tree.rootBlockId(edit.blockId)) return null;
  const expected = edit.expected.map(run => run.text).join("");
  if (!expected) return null;
  const text = tree
    .spans(edit.blockId)
    .map(span => (typeof span.value === "string" ? span.value : "\uFFFC"))
    .join("");
  const start = text.indexOf(expected);
  if (start < 0 || text.indexOf(expected, start + 1) >= 0) return null;
  return { start, end: start + expected.length };
}
