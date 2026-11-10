import * as Y from "yjs";
import { Element, Text, type Descendant } from "slate";
import {
  captureScopedTextEdit,
  CollaborationError,
  NodeTree,
  type ContentNode,
  type ScopedContentEdit,
  type ScopedContentEdits,
} from "@tau/collaboration";
import { prepareContentContracts, prepareContentMarkdown } from "@/services/editorKit";
import { offsetToMarkdownPoint } from "./snapshot";
import { resolveLocatorToRange } from "./locator";
import { EditEngineError } from "./edit-engine";
import type { AppliedPatch, ContentSnapshot, EditOperation } from "./types";

const unsupported = (operationId: string) =>
  new EditEngineError("UNSUPPORTED_RANGE", "无法无损定位该范围，请选择完整块或纯文本", {
    operationId,
  });

function captureText(
  tree: NodeTree,
  id: string,
  block: string,
  start: number,
  end: number,
  text: string
) {
  try {
    return captureScopedTextEdit(tree, id, block, start, end, text);
  } catch (error) {
    if (error instanceof CollaborationError && error.code === "UNSUPPORTED_RANGE") return;
    throw error;
  }
}

function textPoint(snapshot: ContentSnapshot, offset: number) {
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
    offset: parent.children
      .slice(0, index)
      .reduce(
        (length, child) => length + (Text.isText(child) ? child.text.length : 1),
        point.offset
      ),
  };
}

export async function compileScopedPlan(
  snapshot: ContentSnapshot,
  patches: AppliedPatch[],
  operations: EditOperation[]
): Promise<ScopedContentEdits> {
  if (!snapshot.editState) throw new Error("缺少正文协作快照");
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, snapshot.editState.state);
  const tree = new NodeTree(doc);
  try {
    const roots = tree.snapshot() as (ContentNode & { collabId: string })[];
    const edits: ScopedContentEdit[] = [];
    const contracts = {};
    let bounds: { start: number; end: number; index: number }[] | undefined;
    for (const [index, patch] of patches.entries()) {
      const operation = operations[index];
      const start = textPoint(snapshot, patch.start);
      const end = textPoint(snapshot, patch.end);
      const blockInsertion =
        operation.op === "insert" &&
        (operation.locator.kind === "full-document" ||
          patch.afterText.includes("\n\n") ||
          ((operation.position === "before" || operation.position === "after") &&
            (operation.locator.kind === "active-block" ||
              (operation.locator.kind === "slate-path" && operation.locator.path.length === 1))));
      // Markdown 语法有意义时按块解析，纯文本范围才直接改共享字符。
      if (!blockInsertion && start && end && start.id === end.id) {
        const edit = captureText(
          tree,
          patch.operationId,
          start.id,
          start.offset,
          end.offset,
          patch.afterText
        );
        if (edit?.expected.map(run => run.text).join("") === patch.beforeText) {
          const markup =
            /[\r\n\\`*_~\[\]<>|$]/u.test(patch.afterText) ||
            (start.offset === 0 && /^(?:#{1,6}\s|[-+>]\s|\d+[.)]\s|:)/u.test(patch.afterText));
          if (!markup) {
            edits.push(edit);
            continue;
          }
          const parsed = await (await prepareContentMarkdown({})).importDocument(patch.afterText);
          const node = parsed.content[0];
          if (
            parsed.content.length === 1 &&
            Element.isElement(node) &&
            node.type === "paragraph" &&
            !/[\r\n]/u.test(patch.afterText) &&
            node.children.every(Text.isText)
          ) {
            const runs = node.children.map(({ text, ...properties }) => {
              const marks: Record<string, unknown> = properties;
              delete marks.type;
              return { text, marks: { ...edit.expected[0]?.marks, ...marks } };
            });
            edits.push({ ...edit, text: runs.map(run => run.text).join(""), runs });
            continue;
          }
        }
      }
      bounds ??= roots.flatMap((_node, blockIndex) => {
        try {
          const range = resolveLocatorToRange({
            locator: { kind: "slate-path", path: [blockIndex] },
            snapshot,
            selection: null,
          });
          return [{ start: range.start, end: range.end, index: blockIndex }];
        } catch {
          return [];
        }
      });
      let first: number;
      let last: number;
      let markdown: string;
      if (blockInsertion) {
        const before = bounds.find(bound => bound.start === patch.start);
        const after = bounds.find(bound => bound.end === patch.start);
        const boundary =
          operation.locator.kind === "full-document"
            ? patch.start === 0
              ? 0
              : roots.length
            : operation.op === "insert" && operation.position === "before"
              ? before?.index
              : after !== undefined
                ? after.index + 1
                : before?.index;
        if (boundary === undefined && !(patch.start === 0 && roots.length === 0))
          throw unsupported(patch.operationId);
        first = last = boundary ?? 0;
        markdown = patch.afterText;
      } else {
        const startBlock = bounds.find(
          bound => bound.start <= patch.start && patch.start < bound.end
        );
        const endBlock = bounds.find(bound => bound.start < patch.end && patch.end <= bound.end);
        if (
          !startBlock ||
          !endBlock ||
          endBlock.index < startBlock.index ||
          patch.start !== startBlock.start ||
          patch.end !== endBlock.end
        )
          throw unsupported(patch.operationId);
        first = startBlock.index;
        last = endBlock.index + 1;
        markdown = patch.afterText;
      }
      const parsed = markdown.trim()
        ? await (await prepareContentMarkdown({})).importDocument(markdown)
        : { content: [], contracts: {} };
      const prepared = await (
        await prepareContentContracts()
      ).createDocument(parsed.content, parsed.contracts);
      Object.assign(contracts, prepared.contracts);
      edits.push({
        kind: "blocks",
        id: patch.operationId,
        left: roots[first - 1]?.collabId ?? null,
        right: roots[last]?.collabId ?? null,
        expected: roots.slice(first, last),
        nodes: prepared.content as ContentNode[],
      });
    }
    return { edits, contracts };
  } finally {
    tree.dispose();
    doc.destroy();
  }
}
