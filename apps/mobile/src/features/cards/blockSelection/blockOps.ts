import { copyNodeToClipboard, createParagraph } from "@tau/editor/api";
import { Editor, Transforms, type Descendant } from "slate";
import { HistoryEditor } from "slate-history";
import { toast } from "../../../components/toast";

export type MoveDirection = "up" | "down";

/** 升序去重，丢弃不在 [0, length) 内的下标 */
export function normalizeBlockIndices(indices: readonly number[], length: number): number[] {
  return Array.from(new Set(indices))
    .filter(index => Number.isInteger(index) && index >= 0 && index < length)
    .sort((a, b) => a - b);
}

/** 整组能否朝该方向移动一位：空选择、上移含首块、下移含末块时不可移动 */
export function canMoveBlocks(
  indices: readonly number[],
  direction: MoveDirection,
  length: number
): boolean {
  const sorted = normalizeBlockIndices(indices, length);
  if (sorted.length === 0) return false;
  return direction === "up" ? sorted[0] > 0 : sorted[sorted.length - 1] < length - 1;
}

/** 多步改动合并为一个撤销步；编辑器未挂 slate-history 时直接执行 */
export function inSingleUndoStep(editor: Editor, run: () => void) {
  if (HistoryEditor.isHistoryEditor(editor)) {
    HistoryEditor.withNewBatch(editor, run);
  } else {
    run();
  }
}

/**
 * 顶层块整组移动一位：不连续的选中块各自与相邻的未选块互换。
 * 返回移动后的下标；整组不可移动时返回 null 且不改动文档。
 */
export function moveBlocks(
  editor: Editor,
  indices: readonly number[],
  direction: MoveDirection
): number[] | null {
  const sorted = normalizeBlockIndices(indices, editor.children.length);
  if (!canMoveBlocks(sorted, direction, editor.children.length)) return null;
  const delta = direction === "up" ? -1 : 1;
  // 上移从小到大、下移从大到小，保证每次移动的目标位都是未选块
  const order = direction === "up" ? sorted : [...sorted].reverse();
  inSingleUndoStep(editor, () => {
    for (const index of order) {
      Transforms.moveNodes(editor, { at: [index], to: [index + delta] });
    }
  });
  return sorted.map(index => index + delta);
}

/**
 * 把顶层块 from 移到 to（移除该块后的插入位，即移动后的下标），单独一个撤销步。
 * 下标越界或 from === to 时不改动文档并返回 false。
 */
export function moveBlockTo(editor: Editor, from: number, to: number): boolean {
  const length = editor.children.length;
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < length;
  if (!inRange(from) || !inRange(to) || from === to) return false;
  inSingleUndoStep(editor, () => {
    // moveNodes 的 to 是节点移动后的路径，与「移除后的插入位」一致
    Transforms.moveNodes(editor, { at: [from], to: [to] });
  });
  return true;
}

/** 删除选中的顶层块；删空文档时补一个空段落 */
export function deleteBlocks(editor: Editor, indices: readonly number[]): void {
  const sorted = normalizeBlockIndices(indices, editor.children.length);
  if (sorted.length === 0) return;
  inSingleUndoStep(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      for (const index of [...sorted].reverse()) {
        Transforms.removeNodes(editor, { at: [index] });
      }
      if (editor.children.length === 0) {
        Transforms.insertNodes(editor, createParagraph() as Descendant, { at: [0] });
      }
    });
  });
}

const blockCopyFeedback = {
  success: (message: string) => void toast.success(message),
  error: (message: string) => void toast.error(message),
  warning: (message: string) => void toast.warning(message),
};

/** 按文档顺序把选中的顶层块作为一个 fragment 写入剪贴板 */
export function copyBlocks(editor: Editor, indices: readonly number[]): Promise<boolean> {
  const nodes = normalizeBlockIndices(indices, editor.children.length).map(
    index => editor.children[index]
  );
  if (nodes.length === 0) return Promise.resolve(false);
  return copyNodeToClipboard(editor, nodes, blockCopyFeedback);
}

/**
 * 剪切选中的顶层块：fragment 写入剪贴板成功后删除。写入期间文档可能变化，
 * 删除按节点引用重新定位，已不在文档中的块跳过。
 */
export async function cutBlocks(editor: Editor, indices: readonly number[]): Promise<boolean> {
  const nodes = normalizeBlockIndices(indices, editor.children.length).map(
    index => editor.children[index]
  );
  if (nodes.length === 0) return false;
  const copied = await copyNodeToClipboard(editor, nodes, blockCopyFeedback, {
    allowPlainTextFallback: false,
  });
  if (!copied) return false;
  deleteBlocks(
    editor,
    nodes.map(node => editor.children.indexOf(node)).filter(index => index >= 0)
  );
  return true;
}

type NodeRecord = Record<string, unknown>;

/** 递归刷新副本中各节点的身份字段 */
function refreshIdentity(value: unknown) {
  if (!value || typeof value !== "object") return;
  const node = value as NodeRecord;
  // 代码块控制器、媒体与批注等按 uuid 登记，副本与原块共用会串到同一控制器
  if (typeof node.uuid === "string") node.uuid = crypto.randomUUID();
  // 勾选项身份同粘贴语义：清除 taskId 由规范化（或正文索引）重新分配，并清空原实例历史
  if (node.type === "check-list-item") {
    delete node.taskId;
    if ("taskOccurrenceState" in node || "taskCompletedAt" in node) {
      node.taskOccurrenceState = {};
      node.taskCompletedAt = null;
    }
  }
  if (Array.isArray(node.children)) node.children.forEach(refreshIdentity);
}

/** 块的深拷贝：uuid 换新，勾选项清除 taskId 与实例状态；tabs 的 tabKey 等块内引用保持不变 */
export function cloneBlockWithFreshIdentity(node: Descendant): Descendant {
  const copy = structuredClone(node);
  refreshIdentity(copy);
  return copy;
}

/** 在最后一个选中块之后按顺序插入选中块的副本（身份字段换新），返回副本的下标 */
export function duplicateBlocks(editor: Editor, indices: readonly number[]): number[] {
  const sorted = normalizeBlockIndices(indices, editor.children.length);
  if (sorted.length === 0) return [];
  const copies = sorted.map(index => cloneBlockWithFreshIdentity(editor.children[index]));
  const insertAt = sorted[sorted.length - 1] + 1;
  inSingleUndoStep(editor, () => {
    Transforms.insertNodes(editor, copies, { at: [insertAt] });
  });
  return copies.map((_, offset) => insertAt + offset);
}
