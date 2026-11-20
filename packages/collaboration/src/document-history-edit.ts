import * as Y from "yjs";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { readDocumentIdentity } from "./document-version";
import { readNodeDocument, validateNodeDocument, type NodeDocumentOptions } from "./node-document";
import { NodeTree } from "./node-tree";
import { CollaborationError, type ContentNode } from "./protocol";
import {
  buildScopedContentUpdate,
  captureScopedTextEdit,
  ScopedContentConflictError,
  type ScopedContentEdit,
} from "./scoped-content-edit";
import { replaceText, sharedValueEquals } from "./shared-values";
import { documentHistoryChanges, type DocumentHistoryReader } from "./document-history";

const blockId = (node: ContentNode) => String(node.collabId);
const revisionConflict = () =>
  new CollaborationError("CONTENT_VERSION_CONFLICT", "正文在预览后已变化，请重新确认", 409);
const scopeConflict = (id?: string) =>
  new ScopedContentConflictError([{ opId: "history-undo", blockId: id }]);

export interface DocumentHistoryAction {
  operationId: string;
  kind: "restore" | "undo";
  sequence: number;
  expectedRevision?: string;
}

export function validateDocumentHistoryAction(action: DocumentHistoryAction): void {
  if (
    !action ||
    typeof action.operationId !== "string" ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(action.operationId) ||
    (action.kind !== "restore" && action.kind !== "undo") ||
    !Number.isSafeInteger(action.sequence) ||
    action.sequence < 0 ||
    (action.kind === "restore" &&
      (typeof action.expectedRevision !== "string" ||
        !/^[a-f0-9]{64}$/.test(action.expectedRevision)))
  )
    throw new CollaborationError("INVALID_HISTORY_ACTION", "历史操作参数无效", 400);
}

function changeMetadata(current: Y.Doc, target: Y.Doc, expected?: Y.Doc): void {
  for (const name of ["title", "bannerBg", "bannerPosition"] as const) {
    const read = (doc: Y.Doc) =>
      name === "title" ? doc.getText("title").toString() : String(doc.getMap("meta").get(name));
    const value = read(target);
    if (expected && read(expected) === value) continue;
    if (expected && read(expected) !== read(current)) throw scopeConflict();
    if (name === "title") replaceText(current.getText("title"), value);
    else if (value !== read(current)) current.getMap("meta").set(name, value);
  }
}

function removeBlocks(tree: NodeTree, blocks: ContentNode[]): void {
  const ids: string[] = [];
  const visit = (block: ContentNode) => {
    if (typeof block.collabId === "string") ids.push(block.collabId);
    block.children?.forEach(visit);
  };
  blocks.forEach(visit);
  tree.removeNodes(ids, null);
}

function restoreBlocks(tree: NodeTree, desired: ContentNode[]): void {
  const existing = new Map(tree.snapshot().map(node => [blockId(node), node]));
  const wanted = new Map(desired.map(node => [blockId(node), node]));
  const removed: ContentNode[] = [];
  for (const [id, node] of existing) {
    const target = wanted.get(id);
    if (sharedValueEquals(node, target)) continue;
    if (
      !target ||
      !textOnly(node) ||
      !textOnly(target) ||
      !sharedValueEquals(nodeProperties(node), nodeProperties(target))
    ) {
      removed.push(node);
      continue;
    }
    tree.doc.transact(() => {
      const textLength = tree.spans(id).reduce((length, span) => length + span.length, 0);
      if (textLength) tree.deleteText(id, 0, textLength, null);
      let offset = 0;
      for (const leaf of target.children ?? []) {
        const { text } = leaf;
        if (!text) continue;
        const marks = Object.fromEntries(
          Object.entries(leaf).filter(([key]) => key !== "text" && key !== "type")
        );
        tree.insertText(id, offset, text, null, marks);
        offset += text.length;
      }
    }, null);
  }
  removeBlocks(tree, removed);
  const order = tree.snapshot().map(blockId);
  for (const [index, node] of desired.entries()) {
    const id = blockId(node);
    const position = order.indexOf(id, index);
    if (position === index) continue;
    if (position < 0) {
      order.splice(index, 0, tree.insertNode(node, null, index, null));
      continue;
    }
    tree.moveNode(id, null, index, null);
    order.splice(position, 1);
    order.splice(index, 0, id);
  }
}

function textOnly(node: ContentNode): boolean {
  return Boolean(node.children?.every(child => typeof child.text === "string" && !child.children));
}

function nodeProperties(node: ContentNode) {
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== "children"));
}

type Run = { text: string; marks: Record<string, unknown> };
type TextRange = { oldStart: number; oldEnd: number; start: number; end: number };

function textIdentities(tree: NodeTree, id: string) {
  const spans = tree.spans(id);
  if (spans.reduce((length, span) => length + span.length, 0) > 32768) return;
  const sources = new Map<string | null, { start: number; end: number; item: Y.Item }[]>();
  const characters: { identity: string; offset: number; size: number; marks: unknown }[] = [];
  let logical = 0;
  for (const span of spans) {
    if (typeof span.value !== "string") return;
    let ranges = sources.get(span.source);
    if (!ranges) {
      ranges = [];
      let offset = 0;
      for (let item = tree.content(span.source)._start; item; item = item.right) {
        if (item.deleted || !item.countable) continue;
        ranges.push({ start: offset, end: offset + item.length, item });
        offset += item.length;
      }
      sources.set(span.source, ranges);
    }
    let physical = span.offset;
    let index = ranges.findIndex(range => range.end > physical);
    for (const text of span.value) {
      if (physical >= (ranges[index]?.end ?? 0)) index++;
      const range = ranges[index];
      if (!range || physical + text.length > range.end) return;
      const { client, clock } = range.item.id;
      characters.push({
        identity: `${client}:${clock + physical - range.start}`,
        offset: logical,
        size: text.length,
        marks: span.attributes,
      });
      logical += text.length;
      physical += text.length;
    }
  }
  return { characters, length: logical };
}

function stableTextRanges(before: NodeTree, after: NodeTree, id: string): TextRange[] | undefined {
  const old = textIdentities(before, id),
    next = textIdentities(after, id);
  if (!old || !next) return;
  const prior = new Map(old.characters.map(character => [character.identity, character]));
  const ranges: TextRange[] = [];
  let oldStart = 0,
    start = 0;
  const flush = (oldEnd: number, end: number) => {
    if (oldStart !== oldEnd || start !== end) ranges.push({ oldStart, oldEnd, start, end });
  };
  for (const character of next.characters) {
    const match = prior.get(character.identity);
    if (!match || !sharedValueEquals(match.marks, character.marks)) continue;
    if (match.offset < oldStart) return;
    flush(match.offset, character.offset);
    oldStart = match.offset + match.size;
    start = character.offset + character.size;
  }
  flush(old.length, next.length);
  return ranges;
}

function matchingText(left: Run[], right: Run[], reverse = false): number {
  const count = (runs: Run[]) =>
    (reverse ? [...runs].reverse() : runs).filter(run => run.text.length);
  const previous = count(left),
    next = count(right);
  let leftIndex = 0,
    rightIndex = 0,
    leftOffset = 0,
    rightOffset = 0,
    length = 0;
  while (previous[leftIndex] && next[rightIndex]) {
    const a = previous[leftIndex],
      b = next[rightIndex];
    if (!sharedValueEquals(a.marks, b.marks)) break;
    const available = Math.min(a.text.length - leftOffset, b.text.length - rightOffset);
    for (let index = 0; index < available; index++) {
      const leftPosition = reverse ? a.text.length - leftOffset - index - 1 : leftOffset + index;
      const rightPosition = reverse ? b.text.length - rightOffset - index - 1 : rightOffset + index;
      if (a.text[leftPosition] !== b.text[rightPosition]) return length + index;
    }
    length += available;
    leftOffset += available;
    rightOffset += available;
    if (leftOffset === a.text.length) {
      leftIndex++;
      leftOffset = 0;
    }
    if (rightOffset === b.text.length) {
      rightIndex++;
      rightOffset = 0;
    }
  }
  return length;
}

function textInverses(
  before: NodeTree,
  after: NodeTree,
  id: string,
  first: number,
  stable: TextRange[] | undefined
): ScopedContentEdit[] {
  const runs = (tree: NodeTree) =>
    tree
      .spans(id)
      .flatMap(span =>
        typeof span.value === "string" ? [{ text: span.value, marks: span.attributes ?? {} }] : []
      );
  const previous = runs(before),
    next = runs(after);
  const oldText = previous.map(run => run.text).join("");
  const newText = next.map(run => run.text).join("");
  const inverse = (
    index: number,
    oldStart: number,
    oldEnd: number,
    start: number,
    end: number
  ): ScopedContentEdit => {
    const operation = String(first + index);
    const old = captureScopedTextEdit(before, operation, id, oldStart, oldEnd, "");
    return {
      ...captureScopedTextEdit(after, operation, id, start, end, ""),
      text: old.expected.map(run => run.text).join(""),
      runs: old.expected,
    };
  };
  if (stable)
    return stable.map((range, index) =>
      inverse(index, range.oldStart, range.oldEnd, range.start, range.end)
    );
  const splits = (text: string, offset: number) =>
    /[\uD800-\uDBFF]/u.test(text.charAt(offset - 1)) &&
    /[\uDC00-\uDFFF]/u.test(text.charAt(offset));
  let start = matchingText(previous, next);
  if (splits(oldText, start) || splits(newText, start)) start--;
  let suffix = Math.min(
    matchingText(previous, next, true),
    Math.min(oldText.length, newText.length) - start
  );
  if (splits(oldText, oldText.length - suffix) || splits(newText, newText.length - suffix))
    suffix--;
  if (oldText.length === start + suffix && newText.length === start + suffix) return [];
  return [inverse(0, start, oldText.length - suffix, start, newText.length - suffix)];
}

function previousPosition(order: string[], id: string, available: string[]): number {
  const index = order.indexOf(id);
  const left = index === 0 ? -1 : available.indexOf(order[index - 1]);
  const right = index === order.length - 1 ? available.length : available.indexOf(order[index + 1]);
  if ((index > 0 && left < 0) || right !== left + 1) throw scopeConflict(id);
  return right;
}

async function undoBlocks(
  candidate: Y.Doc,
  before: Y.Doc,
  after: Y.Doc,
  sameBaseline: boolean
): Promise<void> {
  const prior = new NodeTree(before),
    later = new NodeTree(after),
    current = new NodeTree(candidate);
  try {
    const beforeBlocks = [...prior.snapshot()],
      afterBlocks = [...later.snapshot()];
    const beforeOrder = beforeBlocks.map(blockId);
    const edits: ScopedContentEdit[] = [];
    const replacements: { id: string; prior: ContentNode; current: ContentNode }[] = [];
    const changes = documentHistoryChanges(beforeBlocks, afterBlocks);
    const visible = new Map(current.snapshot().map(node => [blockId(node), node]));
    const moved = new Set<string>();
    for (const { blockId: id, kind, before: old, after: next } of changes) {
      if (kind === "move") {
        if (!sharedValueEquals(prior.placement(id), later.placement(id))) {
          if (
            !sameBaseline ||
            !visible.has(id) ||
            !sharedValueEquals(current.placement(id), later.placement(id))
          )
            throw scopeConflict(id);
          moved.add(id);
        }
        continue;
      }
      if (!old || !next) {
        if (next && !sharedValueEquals(visible.get(id), next)) throw scopeConflict(id);
        if (old && visible.has(id)) throw scopeConflict(id);
        continue;
      }
      if (
        textOnly(old) &&
        textOnly(next) &&
        sharedValueEquals(nodeProperties(old), nodeProperties(next)) &&
        visible.has(id) &&
        (sameBaseline || sharedValueEquals(visible.get(id), next)) &&
        sharedValueEquals(nodeProperties(visible.get(id) as ContentNode), nodeProperties(next))
      ) {
        const stable = sameBaseline ? stableTextRanges(prior, later, id) : undefined;
        if (!stable && !sharedValueEquals(visible.get(id), next)) throw scopeConflict(id);
        const changes = textInverses(
          prior,
          sameBaseline ? later : current,
          id,
          edits.length,
          stable
        );
        if (changes.length) {
          edits.push(...changes);
          continue;
        }
      }
      if (!sharedValueEquals(visible.get(id), next)) throw scopeConflict(id);
      replacements.push({ id, prior: old, current: next });
    }
    if (edits.length) {
      const { update } = await buildScopedContentUpdate(candidate, { edits }, { undo: true });
      Y.applyUpdate(candidate, update);
    }
    const inserted = changes.flatMap(change =>
      change.kind === "insert" && change.after ? [change.after] : []
    );
    removeBlocks(current, inserted);
    for (const id of moved) {
      const record = current.nodes.get(id);
      if (!record || current.isDeleted(id)) throw scopeConflict(id);
      record.set("placement", structuredClone(prior.placement(id)));
    }
    const deleted = changes.filter(change => change.kind === "delete");
    const positions = new Map<string, string>();
    for (const change of replacements) {
      const index = current.snapshot().findIndex(node => blockId(node) === change.id);
      if (index < 0) throw scopeConflict(change.id);
      removeBlocks(current, [change.current]);
      positions.set(change.id, current.insertNode(change.prior, null, index, null));
    }
    for (const id of beforeOrder) {
      const change = deleted.find(item => item.blockId === id);
      if (!change?.before) continue;
      const order = beforeOrder
        .filter(
          key => key === id || !deleted.some(item => item.blockId === key) || positions.has(key)
        )
        .map(key => positions.get(key) ?? key);
      const index = previousPosition(order, id, current.snapshot().map(blockId));
      positions.set(id, current.insertNode(change.before, null, index, null));
    }
  } finally {
    current.dispose();
    later.dispose();
    prior.dispose();
  }
}

export async function buildDocumentHistoryUpdate(
  history: DocumentHistoryReader,
  id: string,
  current: Y.Doc,
  action: DocumentHistoryAction,
  currentRevision: string,
  actorId: string,
  owner: boolean,
  options?: NodeDocumentOptions
): Promise<Uint8Array> {
  validateDocumentHistoryAction(action);
  const entry = history.entry(id, action.sequence);
  const undo = action.kind === "undo";
  if (!owner && (!undo || entry.actorId !== actorId))
    throw new CollaborationError("FORBIDDEN", "没有执行该历史操作的权限", 403);
  if (!undo && currentRevision !== action.expectedRevision) throw revisionConflict();
  if (undo && (entry.kind === "baseline" || history.undone(id, entry.sequence)))
    throw scopeConflict();
  const target = history.replay(id, entry.sequence);
  const candidate = new Y.Doc({ gc: false });
  let before: Y.Doc | undefined;
  try {
    const identity = readDocumentIdentity(current);
    const vector = Y.encodeStateVector(current);
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
    if (undo) {
      const historical = readDocumentIdentity(target);
      before = history.replay(id, entry.sequence - 1);
      changeMetadata(candidate, before, target);
      await undoBlocks(
        candidate,
        before,
        target,
        historical.baselineId === identity.baselineId && historical.epoch === identity.epoch
      );
    } else {
      const tree = new NodeTree(candidate);
      try {
        await tree.installContracts(
          target.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
          null
        );
        changeMetadata(candidate, target);
        restoreBlocks(tree, readNodeDocument(target).content);
      } finally {
        tree.dispose();
      }
    }
    await validateNodeDocument(candidate, identity, current, options);
    return Y.encodeStateAsUpdate(candidate, vector);
  } finally {
    before?.destroy();
    candidate.destroy();
    target.destroy();
  }
}
