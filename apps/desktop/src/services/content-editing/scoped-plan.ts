import * as Y from "yjs";
import { validateContentContracts } from "@tau/db-schema/content-contracts";
import { Element, Text, type Descendant } from "slate";
import {
  captureScopedTextEdit,
  buildScopedContentUpdate,
  readNodeDocument,
  CollaborationError,
  NodeTree,
  type ContentNode,
  type ScopedContentEdit,
  type ScopedContentEdits,
} from "@tau/collaboration";
import { prepareContentContracts, prepareContentMarkdown } from "@/services/editorKit";
import { desktopMarkdown, getMarkdownWithPositions } from "@/utils/markdown";
import { getTauMarkdownWithPositions } from "@tau/markdown";
import { resolveTextPoint } from "./text-position";
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
    const bounds = snapshot.blockRanges.map((range, index) => ({ ...range, index }));
    for (const [index, patch] of patches.entries()) {
      const operation = operations[index];
      const start = resolveTextPoint(snapshot, patch.start);
      const end = resolveTextPoint(snapshot, patch.end);
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

/** 在快照副本上按建议的实际提交顺序预演；包括每条建议的撤销容量校验。 */
export async function previewScopedPlan(
  state: Uint8Array,
  plan: ScopedContentEdits,
  format?: ContentSnapshot["format"]
) {
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, state);
    for (const edit of plan.edits) {
      const { update } = await buildScopedContentUpdate(doc, {
        contracts: plan.contracts,
        edits: [edit],
      });
      Y.applyUpdate(doc, update);
    }
    const document = readNodeDocument(doc);
    const tree = new NodeTree(doc);
    let contracts;
    try {
      contracts = await validateContentContracts(tree.contracts.toJSON());
    } finally {
      tree.dispose();
    }
    return format === "tau-markdown/1"
      ? getTauMarkdownWithPositions(document.content as Descendant[], {
          processor: desktopMarkdown,
          metadata: { contracts },
        }).markdown
      : getMarkdownWithPositions(document.content as Descendant[]).markdown;
  } finally {
    doc.destroy();
  }
}
