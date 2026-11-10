/**
 * 有「直接改」权限的 Agent 实时打字：一条改动拆成若干小段依次落地（每段是一次带独立操作 ID 的
 * 范围编辑，走正常写入队列），光标随写随走；每段落笔前检查有没有人正在编辑这一块，有就停手让出，
 * 剩下的文字交给调用方转成待处理建议。只用于本机正文，共享正文整条提交。
 */

import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import {
  NodeTree,
  type ScopedContentEdit,
  type ScopedContentResult,
  type ScopedContentSubmission,
} from "@tau/collaboration";

type TextEdit = Extract<ScopedContentEdit, { kind: "text" }>;

/** 段与段之间的停顿：一句话一两秒打完，看得见在写又不拖沓 */
export const TYPE_INTERVAL_MS = 45;
/** 一条改动最多拆这么多段（撤销时作为一次范围操作提交，上限远低于 256 条） */
const MAX_CHUNKS = 40;

export interface TypingSession {
  doc: Y.Doc;
  awareness: Awareness;
}

export interface TypingHost {
  /** 本机正文才逐段打字；共享正文整条提交（逐段会变成大量服务器往返） */
  local: boolean;
  /** 正文当前的主进程会话；会话没了就停手 */
  session(): TypingSession | undefined;
  submit(
    request: ScopedContentSubmission,
    assertCanWrite?: () => void
  ): Promise<ScopedContentResult>;
  receipt?(operationId: string): Extract<ScopedContentResult, { status: "committed" }> | undefined;
  /** 光标移到已落地文字末尾 */
  moved(caret: { blockId: string; position: string }): void;
  delay(ms: number): Promise<void>;
}

/** 有人（非 Agent）在这一块里编辑：光标落在同一顶层块且处于编辑态 */
export function humanEditing(session: TypingSession, blockId: string): boolean {
  const tree = new NodeTree(session.doc);
  try {
    const root = tree.rootBlockId(blockId);
    if (!root) return false;
    for (const state of session.awareness.getStates().values()) {
      const user = state?.user as { agent?: boolean } | undefined;
      const focus = (state?.nodeTreeSelection as { range?: { focus?: unknown } } | undefined)?.range
        ?.focus;
      if (state?.activity !== "editing" || user?.agent || typeof focus !== "string") continue;
      try {
        const position = tree.resolvePosition(
          Y.decodeRelativePosition(Buffer.from(focus, "base64"))
        );
        if (position && tree.rootBlockId(position.parent) === root) return true;
      } catch {
        // 解析不了的选区（别的文档、旧状态）不算在这一块里
      }
    }
    return false;
  } finally {
    tree.dispose();
  }
}

/** 按码点切段（不切开代理对），段数不超过 MAX_CHUNKS */
export const typingChunks = (text: string) => {
  const chars = [...text];
  const size = Math.max(2, Math.ceil(chars.length / MAX_CHUNKS));
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += size)
    chunks.push(chars.slice(index, index + size).join(""));
  return chunks;
};

/** 能逐段打字的改动：块内纯文字、单一格式、有新文字 */
export const canType = (edit: ScopedContentEdit): edit is TextEdit =>
  edit.kind === "text" &&
  edit.text.length > 0 &&
  (!edit.runs || edit.runs.length <= 1) &&
  // 首段需要带回原文供撤销；大改动走整条提交，避免只写前缀后取不到逆操作。
  new TextEncoder().encode(JSON.stringify(edit)).byteLength <= 32 * 1024;

export type TypingOutcome =
  /** 全部落地；inverse 为各段逆操作（相邻不重叠，撤销时一次提交） */
  | { status: "accepted"; inverse: ScopedContentEdit[] }
  /** 有人在这一块编辑，停手让出；typed 为已落地的文字，remainder 为接在其后的剩余改动 */
  | {
      status: "yielded";
      inverse: ScopedContentEdit[];
      typed: string;
      remainder?: { edit: TextEdit; text: string };
    }
  /** 第一段就没能落地：按原样交给调用方处理（过期、未确认等） */
  | { status: "failed"; result: ScopedContentResult }
  /** 第一段与原文相同（提交是空操作、没有逆操作可接续）：改为整条提交 */
  | { status: "atomic" };

export async function typeEdit(
  edit: TextEdit,
  base: Omit<ScopedContentSubmission, "operationId" | "scope">,
  scope: Pick<ScopedContentSubmission["scope"], "contracts" | "source">,
  operationId: string,
  host: TypingHost,
  signal?: AbortSignal,
  assertPermission?: () => void
): Promise<TypingOutcome> {
  const marks = edit.runs?.[0]?.marks ?? edit.expected[0]?.marks ?? {};
  const chunks = typingChunks(edit.text);
  const inverse: ScopedContentEdit[] = [];
  let typed = "";
  let boundary: TextEdit["continuation"];
  const interrupted = () => {
    const session = host.session();
    return signal?.aborted || !session || humanEditing(session, edit.blockId);
  };
  const remainder = (from: number) => {
    const text = chunks.slice(from).join("");
    return boundary && text
      ? {
          text,
          edit: {
            kind: "text" as const,
            id: `${edit.id}.rest`,
            blockId: edit.blockId,
            ...boundary,
            expected: [],
            text,
            runs: [{ text, marks }],
          },
        }
      : undefined;
  };
  for (const [index, chunk] of chunks.entries()) {
    const chunkId = `${operationId}.t${index}`;
    const recorded = host.receipt?.(chunkId);
    const yielded = () => ({
      status: "yielded" as const,
      inverse,
      typed,
      remainder: remainder(index),
    });
    if (!recorded && (interrupted() || (index > 0 && !boundary))) return yielded();
    // 第一段替换原文，之后每段插在已落地文字的末尾（相对位置随文档移动，不怕别处同时在改）
    const piece: TextEdit = index
      ? {
          kind: "text",
          id: `${edit.id}.t${index}`,
          blockId: edit.blockId,
          start: boundary?.start ?? "",
          end: boundary?.end ?? "",
          expected: [],
          text: chunk,
          runs: [{ text: chunk, marks }],
        }
      : { ...edit, id: `${edit.id}.t0`, text: chunk, runs: [{ text: chunk, marks }] };
    let result: ScopedContentResult;
    try {
      result =
        recorded ??
        (await host.submit(
          {
            ...base,
            operationId: chunkId,
            scope: { ...scope, edits: [piece] },
          },
          () => {
            if (interrupted()) throw new Error("AGENT_YIELDED");
            assertPermission?.();
          }
        ));
    } catch (error) {
      if (
        error instanceof Error &&
        ["AGENT_YIELDED", "AGENT_PERMISSION_CHANGED"].includes(error.message)
      )
        return yielded();
      if (!index) throw error;
      return yielded();
    }
    const undo = result.status === "committed" ? result.inverse?.edits[0] : undefined;
    if (!undo || undo.kind !== "text") {
      if (!index)
        return result.status === "committed" ? { status: "atomic" } : { status: "failed", result };
      return { status: "yielded", inverse, typed, remainder: remainder(index) };
    }
    inverse.push(undo);
    typed += chunk;
    boundary = undo.continuation;
    if (!recorded && !signal?.aborted) host.moved({ blockId: edit.blockId, position: undo.end });
    if (!recorded && !signal?.aborted && index < chunks.length - 1)
      await host.delay(TYPE_INTERVAL_MS);
  }
  return { status: "accepted", inverse };
}
