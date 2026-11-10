import * as Y from "yjs";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { NodeTree } from "./node-tree";
import { NODE_DOCUMENT_VERSION } from "./node-document";
import { CollaborationError, type ContentNode } from "./protocol";
import { sharedValueEquals } from "./shared-values";

type TextRun = { text: string; marks: Record<string, unknown> };
const splitsPair = (text: string, offset: number) =>
  /[\uD800-\uDBFF]/u.test(text.charAt(offset - 1)) && /[\uDC00-\uDFFF]/u.test(text.charAt(offset));
type TextEdit = {
  kind: "text";
  id: string;
  blockId: string;
  start: string;
  end: string;
  expected: TextRun[];
  text: string;
  runs?: TextRun[];
  /** 逆操作额外记录提交后插入点的两侧，供逐段编辑安全接续。 */
  continuation?: { start: string; end: string };
};
type BlockEdit = {
  kind: "blocks";
  id: string;
  left: string | null;
  right: string | null;
  expected: (ContentNode & { collabId: string })[];
  nodes: ContentNode[];
};
export type ScopedContentEdit = TextEdit | BlockEdit;
export interface ScopedContentEdits {
  edits: ScopedContentEdit[];
  contracts?: ContentContractDictionary;
  source?: { proposalId: string; agentId?: string; runId?: string };
}
export interface ScopedContentBaseline {
  documentId: string;
  baselineId: string;
  epoch: number;
}
export interface ScopedContentSubmission extends ScopedContentBaseline {
  operationId: string;
  scope: ScopedContentEdits;
}
export type ScopedContentResult =
  | { status: "committed"; inverse?: ScopedContentEdits }
  | { status: "conflict"; conflicts: ScopedContentConflict[] }
  | { status: "pending" }
  | { status: "rejected"; reason: string };
export interface ScopedContentConflict {
  opId: string;
  blockId?: string;
}

export class ScopedContentConflictError extends CollaborationError {
  constructor(readonly conflicts: ScopedContentConflict[]) {
    super("SCOPE_CONFLICT", "目标范围已变化，请重新读取后再修改", 409);
  }
}

function textRuns(tree: NodeTree, block: string, start: number, end: number): TextRun[] {
  let offset = 0;
  const result: TextRun[] = [];
  for (const span of tree.spans(block)) {
    const from = Math.max(start - offset, 0);
    const to = Math.min(end - offset, span.length);
    if (
      typeof span.value === "string" &&
      (splitsPair(span.value, from) || splitsPair(span.value, to))
    )
      throw new CollaborationError("INVALID_RANGE", "文本位置切开了 Unicode 字符", 400);
    offset += span.length;
    if (from >= to) continue;
    if (typeof span.value !== "string")
      throw new CollaborationError("UNSUPPORTED_RANGE", "范围包含内联节点，请按块编辑", 400);
    const text = span.value.slice(from, to);
    const marks = span.attributes ?? {};
    const last = result.at(-1);
    if (last && sharedValueEquals(last.marks, marks)) last.text += text;
    else result.push({ text, marks });
  }
  if (end > offset) throw new CollaborationError("INVALID_RANGE", "文本位置超出范围", 400);
  return result;
}

export function captureScopedTextEdit(
  tree: NodeTree,
  id: string,
  blockId: string,
  start: number,
  end: number,
  text: string
): TextEdit {
  const insertion = start === end;
  return {
    kind: "text",
    id,
    blockId,
    start: JSON.stringify(tree.capturePosition(blockId, start, insertion ? -1 : 0)),
    end: JSON.stringify(tree.capturePosition(blockId, end, insertion ? 0 : -1)),
    expected: textRuns(tree, blockId, start, end),
    text,
  };
}

const invalid = () => new CollaborationError("INVALID_OPERATION", "范围编辑参数无效", 400);
const UNDO_SUFFIX = "-undo";
const MAX_INVERSE_BYTES = 64 * 1024;
export const scopedUndoOperationId = (operationId: string) => `${operationId}${UNDO_SUFFIX}`;
export const scopedUndoSourceId = (operationId: string) =>
  operationId.endsWith(UNDO_SUFFIX) ? operationId.slice(0, -UNDO_SUFFIX.length) : undefined;

export class ScopedUndoLimitError extends CollaborationError {
  static readonly code = "UNDO_LIMIT";
  static readonly description = "改动超出可撤销容量，请拆成较小的修改";

  constructor() {
    super(ScopedUndoLimitError.code, ScopedUndoLimitError.description, 400);
  }
}

type RootBlocks = { roots: BlockEdit["expected"]; indices: Map<string, number> };
type LocatedEdit =
  | { kind: "text"; edit: TextEdit; start: number; end: number; root: number }
  | { kind: "blocks"; edit: BlockEdit; start: number; end: number };

const rootBlocks = (tree: NodeTree): RootBlocks => {
  const roots = tree.snapshot() as BlockEdit["expected"];
  return { roots, indices: new Map(roots.map((node, index) => [node.collabId, index])) };
};

/**
 * 按锚点在当前正文里定位一条编辑，并核对原文前提（文字连同格式、整块内容）；
 * 锚点解析不到或前提不符返回 null。锚点本身格式错误时抛 INVALID_OPERATION。
 */
function locateScopedEdit(
  tree: NodeTree,
  edit: ScopedContentEdit,
  { roots, indices }: RootBlocks
): LocatedEdit | null {
  if (edit.kind === "text") {
    const decode = (position: string) =>
      tree.resolvePosition(Y.createRelativePositionFromJSON(JSON.parse(position)));
    let start, end;
    try {
      start = decode(edit.start);
      end = decode(edit.end);
    } catch {
      throw invalid();
    }
    const rootId = tree.rootBlockId(edit.blockId);
    const root = rootId === undefined ? undefined : indices.get(rootId);
    if (
      root === undefined ||
      start?.parent !== edit.blockId ||
      end?.parent !== edit.blockId ||
      start.offset > end.offset
    )
      return null;
    try {
      if (!sharedValueEquals(textRuns(tree, edit.blockId, start.offset, end.offset), edit.expected))
        return null;
    } catch (error) {
      if (error instanceof CollaborationError) return null;
      throw error;
    }
    return { kind: "text", edit, start: start.offset, end: end.offset, root };
  }
  const start = edit.expected.length
    ? indices.get(edit.expected[0].collabId)
    : edit.left === null
      ? 0
      : (indices.get(edit.left) ?? -2) + 1;
  const end = (start ?? -1) + edit.expected.length;
  if (
    start === undefined ||
    start < 0 ||
    (edit.expected.length
      ? !sharedValueEquals(roots.slice(start, end), edit.expected)
      : (roots[start]?.collabId ?? null) !== edit.right)
  )
    return null;
  return { kind: "blocks", edit, start, end };
}

/** 逐条判断编辑在当前正文上是否仍成立（锚点能解析且原文前提一致），不修改文档。 */
export function scopedEditsApplicable(current: Y.Doc, edits: ScopedContentEdit[]): boolean[] {
  if (current.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    return edits.map(() => false);
  const tree = new NodeTree(current);
  try {
    const blocks = rootBlocks(tree);
    return edits.map(edit => {
      try {
        return locateScopedEdit(tree, edit, blocks) !== null;
      } catch {
        return false;
      }
    });
  } finally {
    tree.dispose();
  }
}

export function validateScopedContentEdits(value: ScopedContentEdits): void {
  if (!value || !Array.isArray(value.edits) || !value.edits.length || value.edits.length > 256)
    throw invalid();
  const ids = new Set<string>();
  for (const edit of value.edits) {
    if (
      !edit ||
      typeof edit.id !== "string" ||
      !edit.id ||
      edit.id.length > 128 ||
      ids.has(edit.id)
    )
      throw invalid();
    ids.add(edit.id);
    if (edit.kind === "text") {
      if (
        typeof edit.blockId !== "string" ||
        typeof edit.start !== "string" ||
        edit.start.length > 512 ||
        typeof edit.end !== "string" ||
        edit.end.length > 512 ||
        typeof edit.text !== "string" ||
        /[\uD800-\uDFFF]/u.test(edit.text) ||
        !Array.isArray(edit.expected) ||
        edit.expected.some(run => !run || typeof run.text !== "string" || !run.marks) ||
        (edit.runs !== undefined &&
          (!Array.isArray(edit.runs) ||
            edit.runs.some(run => !run || typeof run.text !== "string" || !run.marks) ||
            edit.runs.map(run => run.text).join("") !== edit.text))
      )
        throw invalid();
    } else if (edit.kind === "blocks") {
      if (
        (edit.left !== null && typeof edit.left !== "string") ||
        (edit.right !== null && typeof edit.right !== "string") ||
        !Array.isArray(edit.expected) ||
        !Array.isArray(edit.nodes) ||
        edit.expected.some(node => !node || typeof node.collabId !== "string")
      )
        throw invalid();
    } else throw invalid();
  }
  if (
    value.source &&
    (typeof value.source.proposalId !== "string" ||
      value.source.proposalId.length > 256 ||
      [value.source.agentId, value.source.runId].some(
        id => id !== undefined && (typeof id !== "string" || id.length > 256)
      ))
  )
    throw invalid();
}

/** 在写入队列内从同一份正文校验所有前提，候选失败时不触碰原文档。 */
export async function buildScopedContentUpdate(
  current: Y.Doc,
  request: ScopedContentEdits,
  { undo = false }: { undo?: boolean } = {}
): Promise<{ update: Uint8Array; inverse?: ScopedContentEdits }> {
  validateScopedContentEdits(request);
  if (current.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    throw new CollaborationError("UNSUPPORTED_DOCUMENT", "范围编辑只支持正文文档", 400);
  const candidate = new Y.Doc({ gc: false });
  const vector = Y.encodeStateVector(current);
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
  const tree = new NodeTree(candidate);
  try {
    const blocksAtStart = rootBlocks(tree);
    const conflicts: ScopedContentConflict[] = [];
    const texts: { edit: TextEdit; start: number; end: number; root: number }[] = [];
    const blocks: { edit: BlockEdit; start: number; end: number }[] = [];
    for (const edit of request.edits) {
      const located = locateScopedEdit(tree, edit, blocksAtStart);
      if (!located)
        conflicts.push({
          opId: edit.id,
          blockId:
            edit.kind === "text"
              ? edit.blockId
              : (edit.expected[0]?.collabId ?? edit.left ?? edit.right ?? undefined),
        });
      else if (located.kind === "blocks") blocks.push(located);
      else if (
        !sharedValueEquals(
          located.edit.expected,
          located.edit.runs ??
            (located.edit.text
              ? [{ text: located.edit.text, marks: located.edit.expected[0]?.marks ?? {} }]
              : [])
        )
      )
        texts.push(located);
    }
    if (conflicts.length) throw new ScopedContentConflictError(conflicts);
    const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
      a.start === b.start || (a.start < b.end && b.start < a.end);
    if (
      texts.some((a, index) =>
        texts.slice(index + 1).some(b => a.edit.blockId === b.edit.blockId && overlaps(a, b))
      ) ||
      blocks.some(
        (a, index) =>
          blocks.slice(index + 1).some(b => overlaps(a, b)) ||
          texts.some(text => text.root >= a.start && text.root < a.end)
      )
    )
      throw new CollaborationError("OVERLAPPING_OPERATIONS", "同批编辑范围重叠", 400);

    await tree.installContracts(request.contracts ?? {}, null);
    candidate.transact(() => {
      for (const { edit, start, end } of texts.sort((a, b) => b.start - a.start)) {
        if (end > start) tree.deleteText(edit.blockId, start, end - start, null);
        let offset = start;
        for (const run of edit.runs ?? [{ text: edit.text, marks: edit.expected[0]?.marks }]) {
          if (run.text) tree.insertText(edit.blockId, offset, run.text, null, run.marks);
          offset += run.text.length;
        }
      }
      for (const { edit, start } of blocks.sort((a, b) => b.start - a.start)) {
        tree.removeNodes(
          edit.expected.map(node => node.collabId),
          null
        );
        edit.nodes.forEach((node, index) => tree.insertNode(node, null, start + index, null));
      }
    });
    // 撤销回执只确认恢复结果，保留原操作身份即可继续重试。
    if (undo || (!texts.length && !blocks.length))
      return { update: Y.encodeStateAsUpdate(candidate, vector) };

    const final = tree.snapshot() as BlockEdit["expected"];
    const inverse: ScopedContentEdits = {
      edits: [
        ...texts.map(({ edit, start }) => {
          const offset =
            start +
            texts.reduce(
              (shift, other) =>
                other.edit.blockId === edit.blockId && other.start < start
                  ? shift + other.edit.text.length - (other.end - other.start)
                  : shift,
              0
            );
          const end = offset + edit.text.length;
          const { start: left, end: right } = captureScopedTextEdit(
            tree,
            edit.id,
            edit.blockId,
            end,
            end,
            ""
          );
          return {
            ...captureScopedTextEdit(
              tree,
              edit.id,
              edit.blockId,
              offset,
              end,
              edit.expected.map(run => run.text).join("")
            ),
            runs: edit.expected,
            continuation: { start: left, end: right },
          };
        }),
        ...blocks.map(({ edit, start }): BlockEdit => {
          const index =
            start +
            blocks.reduce(
              (shift, other) =>
                other.start < start
                  ? shift + other.edit.nodes.length - (other.end - other.start)
                  : shift,
              0
            );
          return {
            kind: "blocks",
            id: edit.id,
            left: final[index - 1]?.collabId ?? null,
            right: final[index + edit.nodes.length]?.collabId ?? null,
            expected: final.slice(index, index + edit.nodes.length),
            nodes: edit.expected,
          };
        }),
      ],
    };
    if (new TextEncoder().encode(JSON.stringify(inverse)).byteLength > MAX_INVERSE_BYTES)
      throw new ScopedUndoLimitError();
    return { update: Y.encodeStateAsUpdate(candidate, vector), inverse };
  } finally {
    tree.dispose();
    candidate.destroy();
  }
}
