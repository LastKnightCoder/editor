/**
 * 洞见「写成卡片」（KL-069）：地图上点一下，新建一张空卡片（连好标记涉及的几处）并打开。
 * 适用同一思路、缺一环、问了没写、还缺；卡片在写下内容前是草稿：空正文显示占位提示（不写进正文）；
 * 详情页真正关闭或窗口关闭时正文仍为空就撤回，标记回到未处理。
 */

import { toast } from "@tau/ui";
import { discardPatternCard, writePatternCard } from "@/commands/knowledge-insights";
import useSettingStore from "@/stores/useSettingStore";
import type { KnowledgeMark } from "@/types/knowledge-insights";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { openEntity } from "./open-content";

interface PatternCardDraft {
  nodeId: number;
  markId: string;
  databaseName: string;
  placeholder: string;
  /** 详情页登记：正文现在是否还空着；没登记（详情页没打开过）视为空 */
  isBlank?: () => boolean;
}

const drafts = new Map<number, PatternCardDraft>();

const activeDatabase = () => useSettingStore.getState().setting.database.active;

/** 空卡片的占位提示：按标记类型说清要写什么，后接 AI 的理由 */
export function patternCardPlaceholder(
  mark: Pick<KnowledgeMark, "kind" | "text" | "why" | "missing">
): string {
  const text = (mark.text ?? "").replace(/^还缺[:：]\s*/, "");
  const head =
    mark.kind === "chain"
      ? `写下「${mark.missing?.text ?? ""}」，补上这一环`
      : mark.kind === "asked"
        ? `用自己的话回答「${text}」`
        : mark.kind === "gap"
          ? `写下「${text}」`
          : `用自己的话写下「${text}」这个思路`;
  return [head, mark.why].filter(Boolean).join("。");
}

export async function startPatternCard(nodeId: number, mark: KnowledgeMark): Promise<void> {
  const databaseName = activeDatabase();
  const card = await writePatternCard(nodeId, mark.id);
  drafts.set(card.id, {
    nodeId,
    markId: mark.id,
    databaseName,
    placeholder: patternCardPlaceholder(mark),
  });
  if (activeDatabase() === databaseName) {
    defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
  }
  try {
    await openEntity({ kind: "card", id: card.id });
  } catch (error) {
    settlePatternCard(card.id);
    throw error;
  }
}

/** 草稿卡片的占位提示；不是草稿时为 null */
export const patternCardPlaceholderOf = (cardId: number) => drafts.get(cardId)?.placeholder ?? null;

/** 详情页挂上「正文是否还空着」的读取（再次登记覆盖） */
export function watchPatternCard(cardId: number, isBlank: () => boolean): void {
  const draft = drafts.get(cardId);
  if (draft) draft.isBlank = isBlank;
}

/** 离开草稿卡片：写了内容就转正，不再是草稿；还空着就撤回 */
export function settlePatternCard(cardId: number): void {
  const draft = drafts.get(cardId);
  if (!draft) return;
  drafts.delete(cardId);
  if (!(draft.isBlank?.() ?? true)) return;
  // 撤回走当前库；已经切库时那张空卡片留在原库，不跨库删
  if (activeDatabase() !== draft.databaseName) return;
  discardPatternCard(draft.nodeId, draft.markId, cardId)
    .then(card => {
      if (card && activeDatabase() === draft.databaseName) {
        defaultCardEventBus.createEditor().publishCardEvent("card:deleted", card);
      }
    })
    .catch(error => toast.error(error instanceof Error ? error.message : "撤回空卡片失败"));
}

// 关窗时还空着的草稿一并撤回；IPC 在渲染进程销毁前发出即可由主进程执行完
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const cardId of [...drafts.keys()]) settlePatternCard(cardId);
  });
}
