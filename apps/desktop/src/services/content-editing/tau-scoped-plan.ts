import * as Y from "yjs";
import { validateContentContracts } from "@tau/db-schema/content-contracts";
import { Text } from "slate";
import {
  NodeTree,
  canReconcileScopedBlocks,
  captureScopedTextEdit,
  type ContentNode,
  type ScopedContentEdit,
  type ScopedContentEdits,
} from "@tau/collaboration";
import { decodeTauMarkdown, isTauMarkdown, tauMarkdownEquals } from "@tau/markdown";
import { desktopMarkdown } from "@/utils/markdown";
import { prepareContentContracts, prepareContentMarkdown } from "@/services/editorKit";
import { EditEngineError } from "./edit-engine";
import { resolveTextPoint } from "./text-position";
import type { AppliedPatch, ContentSnapshot, EditOperation } from "./types";

export function decodeTauEditSource(source: string, fragment: boolean) {
  try {
    return decodeTauMarkdown(source, { processor: desktopMarkdown, fragment });
  } catch (error) {
    throw new EditEngineError(
      "INVALID_NATIVE_MARKDOWN",
      "原生语法不完整或非法，请保留容器、围栏及 JSON 字段后重试",
      { failure: error instanceof Error ? error.name : "unknown" }
    );
  }
}

interface Group {
  first: number;
  last: number;
  patches: AppliedPatch[];
  insertion: boolean;
}

export async function compileTauScopedPlan(
  snapshot: ContentSnapshot,
  patches: AppliedPatch[],
  operations: EditOperation[]
): Promise<{ plan: ScopedContentEdits; patches: AppliedPatch[] }> {
  if (!snapshot.editState) throw new Error("缺少原生正文快照");
  const document = new Y.Doc({ gc: false });
  Y.applyUpdate(document, snapshot.editState.state);
  const tree = new NodeTree(document);
  try {
    const dictionary = await validateContentContracts(tree.contracts.toJSON());
    const roots = tree.snapshot() as (ContentNode & { collabId: string })[];
    const operationById = new Map(
      operations.map((operation, index) => [operation.id || "op_" + (index + 1), operation])
    );
    const groups: Group[] = [];
    const bounds = snapshot.blockRanges;
    for (const patch of patches) {
      const operation = operationById.get(patch.operationId);
      if (!operation) throw new EditEngineError("INVALID_OPERATION", "编辑操作身份丢失");
      const insertion =
        operation.op === "insert" &&
        (operation.locator.kind === "full-document" ||
          operation.position === "before" ||
          operation.position === "after");
      if (insertion) {
        let first: number;
        if (operation.locator.kind === "full-document")
          first = patch.start === 0 ? 0 : roots.length;
        else {
          const before = bounds.findIndex(bound => bound.start === patch.start);
          const after = bounds.findIndex(bound => bound.end === patch.start);
          first = operation.position === "before" ? before : after < 0 ? -1 : after + 1;
        }
        if (first < 0) throw new EditEngineError("UNSUPPORTED_RANGE", "请在完整原生块边界插入");
        groups.push({ first, last: first, patches: [patch], insertion: true });
        continue;
      }
      const first = bounds.findIndex(
        bound => bound.start <= patch.start && patch.start < bound.end
      );
      const last = bounds.findIndex(bound => patch.end > bound.start && patch.end <= bound.end);
      if (first < 0 || last < first)
        throw new EditEngineError(
          "IMMUTABLE_METADATA",
          "不能修改协议版本或文档契约，请重读目标正文块"
        );
      groups.push({ first, last: last + 1, patches: [patch], insertion: false });
    }
    groups.sort((a, b) => a.first - b.first || a.last - b.last);
    const merged: Group[] = [];
    for (const group of groups) {
      const previous = merged.at(-1);
      if (previous && !previous.insertion && !group.insertion && group.first < previous.last) {
        previous.last = Math.max(previous.last, group.last);
        previous.patches.push(...group.patches);
      } else merged.push(group);
    }
    const edits: ScopedContentEdit[] = [];
    const collapsed: AppliedPatch[] = [];
    const contracts = { ...dictionary };
    for (const group of merged) {
      const firstPatch = group.patches[0];
      const start = group.insertion ? firstPatch.start : bounds[group.first].start;
      const end = group.insertion ? start : bounds[group.last - 1].end;
      const before = snapshot.markdown.slice(start, end);
      let after = before;
      for (const patch of [...group.patches].sort((a, b) => b.start - a.start))
        after =
          after.slice(0, patch.start - start) + patch.afterText + after.slice(patch.end - start);
      const decoded =
        after.trim() && isTauMarkdown(after) ? decodeTauEditSource(after, true) : null;
      if (after.trim() && !decoded && !group.insertion)
        throw new EditEngineError(
          "FORMAT_REQUIRED",
          "已有正文块必须保留 Tau Markdown 结构，不能降级为普通 Markdown"
        );
      if (
        decoded &&
        Object.keys(decoded.metadata).length &&
        !tauMarkdownEquals(decoded.metadata, { contracts: dictionary })
      )
        throw new EditEngineError("IMMUTABLE_METADATA", "文档契约元信息不能由文本编辑改写");
      if (!group.insertion && group.patches.length === 1 && decoded) {
        const a = resolveTextPoint(snapshot, firstPatch.start);
        const b = resolveTextPoint(snapshot, firstPatch.end);
        if (a && b && a.id === b.id && a.path.join(".") === b.path.join(".")) {
          const candidate = structuredClone(roots.slice(group.first, group.last));
          const path = [a.path[0] - group.first, ...a.path.slice(1)];
          let value: unknown = candidate[path[0]];
          for (const index of path.slice(1))
            value =
              value &&
              typeof value === "object" &&
              "children" in value &&
              Array.isArray(value.children)
                ? value.children[index]
                : undefined;
          if (Text.isText(value)) {
            value.text =
              value.text.slice(0, a.leafOffset) +
              firstPatch.afterText +
              value.text.slice(b.leafOffset);
            if (tauMarkdownEquals(candidate, decoded.content)) {
              const edit = captureScopedTextEdit(
                tree,
                firstPatch.operationId,
                a.id,
                a.offset,
                b.offset,
                firstPatch.afterText
              );
              if (edit.expected.map(run => run.text).join("") === firstPatch.beforeText) {
                edits.push(edit);
                collapsed.push(firstPatch);
                continue;
              }
            }
          }
        }
      }
      const parsed = after.trim()
        ? await (await prepareContentMarkdown(dictionary)).importDocument(after)
        : { content: [], contracts: {} };
      const expected = roots.slice(group.first, group.last);
      const reconcile =
        !group.insertion && canReconcileScopedBlocks(expected, parsed.content as ContentNode[]);
      const prepared = reconcile
        ? parsed
        : await (
            await prepareContentContracts()
          ).createDocument(parsed.content, {
            ...dictionary,
            ...parsed.contracts,
          });
      Object.assign(contracts, prepared.contracts);
      edits.push({
        kind: "blocks",
        id: firstPatch.operationId,
        left: roots[group.first - 1]?.collabId ?? null,
        right: roots[group.last]?.collabId ?? null,
        expected,
        nodes: prepared.content as ContentNode[],
        ...(reconcile ? { reconcile: true } : {}),
      });
      collapsed.push({
        operationId: firstPatch.operationId,
        sourceOperationIds: group.patches.map(patch => patch.operationId),
        op: group.insertion ? "insert" : after.trim() ? "replace" : "delete",
        start,
        end,
        beforeText: before,
        afterText: after,
        charDelta: after.length - before.length,
      });
    }
    return { plan: { edits, contracts }, patches: collapsed };
  } finally {
    tree.dispose();
    document.destroy();
  }
}
