// 卡片批量操作条（纸面浮条样式）：
// 移动卡组 / 改难度 / 删除（删除二次确认）。执行为逐张调用既有单卡接口，
// 完成后统一 invalidate + toast 并退出多选（onFinished）。

import { flashcardTranslator, flashcardCount, useFlashcardI18n } from "./i18n";
import { useState } from "react";
import { ArrowLeftRight, SlidersHorizontal, Trash2 } from "lucide-react";
import DeckIcon from "@tau/shared/deck-icon";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import { invalidateFlashcardQueries, useFlashcardDecks } from "./queries";
import { FLASHCARD_DIFFICULTY_MESSAGE } from "./constants";
import type { FlashcardDifficulty } from "./types";

type CardBatchBarProps = {
  open: boolean;
  /** 当前卡组（目标卡组列表中排除） */
  deckId: number;
  selectedIds: ReadonlySet<number>;
  /** 任一批量操作完成（已 invalidate 与 toast），父级退出多选态 */
  onFinished: () => void;
};

export function CardBatchBar({ open, deckId, selectedIds, onFinished }: CardBatchBarProps) {
  useFlashcardI18n();
  const decksQuery = useFlashcardDecks();
  const [sheet, setSheet] = useState<"move" | "level" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = selectedIds.size;

  const runBatch = async (
    action: "move" | "level" | "delete",
    task: (id: number) => Promise<unknown>
  ) => {
    setBusy(true);
    const failed: number[] = [];
    try {
      // 逐张执行但不在单张失败时中断：重试时已成功的卡会报「不存在」再次卡住，剩余的永远处理不完
      for (const id of selectedIds) {
        try {
          await task(id);
        } catch {
          failed.push(id);
        }
      }
      invalidateFlashcardQueries();
      if (failed.length === 0) {
        toast({ type: "success", text: flashcardCount(`batch.${action}Success`, count) });
      } else {
        toast({
          type: "warning",
          text: flashcardTranslator.t(`batch.${action}Partial`, {
            success: count - failed.length,
            failed: failed.length,
          }),
        });
      }
      onFinished();
    } finally {
      setBusy(false);
    }
  };

  const shown = open && count > 0;

  return (
    <>
      <div
        aria-hidden={shown ? undefined : true}
        inert={!shown}
        className={`bg-surface shadow-float absolute right-3.5 bottom-[calc(22px+var(--mobile-screen-safe-bottom))] left-3.5 z-40 flex gap-1 rounded-[20px] p-1.5 transition-transform duration-300 ${
          // 隐藏位移须含底距与安全区，否则浮条会露出半截
          shown
            ? "translate-y-0"
            : "translate-y-[calc(100%+22px+var(--mobile-screen-safe-bottom)+24px)]"
        }`}
        style={{ transitionTimingFunction: "var(--ease-bounce)" }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => setSheet("move")}
          className="text-ink-1 bg-page flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <ArrowLeftRight size={16} className="flex-none" />
          {flashcardTranslator.t("ui.moveToDeck2")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setSheet("level")}
          className="text-ink-1 bg-page flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <SlidersHorizontal size={16} className="flex-none" />
          {flashcardTranslator.t("ui.changeDifficulty")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="text-danger bg-page flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <Trash2 size={16} className="flex-none" />
          {flashcardTranslator.t("ui.delete")}
        </button>
      </div>

      {/* 移动到卡组 */}
      <BottomSheet
        open={sheet === "move"}
        title={flashcardCount("batch.moveTitle", count)}
        onClose={() => setSheet(null)}
      >
        <div className="flex flex-col gap-2 px-5 pb-7">
          {(decksQuery.data ?? [])
            .filter(item => item.id !== deckId)
            .map(item => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSheet(null);
                  void runBatch("move", id => tauri.flashcardUpdateCard(id, { deckId: item.id }));
                }}
                className="bg-page active:bg-hover flex items-center gap-3 rounded-[16px] p-3 text-left disabled:opacity-50"
              >
                <DeckIcon emoji={item.emoji} className="text-ink-2 size-5 flex-none text-[20px]" />
                <span className="text-ink-1 flex-1 text-[14.5px] font-extrabold">{item.name}</span>
                <span className="text-ink-3 text-[11.5px] font-semibold">
                  {flashcardCount("count.cards", item.stats?.totalCards ?? 0)}
                </span>
              </button>
            ))}
          {(decksQuery.data ?? []).filter(item => item.id !== deckId).length === 0 ? (
            <div className="text-ink-3 py-4 text-center text-[13px] font-semibold">
              {flashcardTranslator.t("ui.createAnotherDeckOnTheHomePageBeforeMovingCards")}
            </div>
          ) : null}
        </div>
      </BottomSheet>

      {/* 批量改难度 */}
      <BottomSheet
        open={sheet === "level"}
        title={flashcardCount("batch.levelTitle", count)}
        onClose={() => setSheet(null)}
      >
        <div className="flex flex-col gap-2 px-5 pb-7">
          {(Object.keys(FLASHCARD_DIFFICULTY_MESSAGE) as FlashcardDifficulty[]).map(level => (
            <button
              key={level}
              type="button"
              disabled={busy}
              onClick={() => {
                setSheet(null);
                void runBatch("level", id => tauri.flashcardUpdateCard(id, { difficulty: level }));
              }}
              className="bg-page text-ink-1 active:bg-hover rounded-[16px] py-3.5 text-[14.5px] font-extrabold disabled:opacity-50"
            >
              {flashcardTranslator.t(FLASHCARD_DIFFICULTY_MESSAGE[level])}
            </button>
          ))}
        </div>
      </BottomSheet>

      <MobileConfirmDialog
        open={confirmDelete}
        title={flashcardCount("batch.deleteTitle", count)}
        description={flashcardTranslator.t(
          "ui.selectedCardsAndTheirReviewHistoriesWillBePermanentlyDeleted"
        )}
        danger
        confirmText={flashcardTranslator.t("ui.delete")}
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void runBatch("delete", id => tauri.flashcardDeleteCard(id));
        }}
      />
    </>
  );
}
