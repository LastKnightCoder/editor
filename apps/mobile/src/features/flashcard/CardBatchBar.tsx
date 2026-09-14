// 卡片批量操作条（纸面浮条样式，设计稿 flashcard-batch-design.html 画框⑥·方案 A）：
// 移动卡组 / 改难度 / 删除（删除二次确认）。执行为逐张调用既有单卡接口，
// 完成后统一 invalidate + toast 并退出多选（onFinished）。

import { useState } from "react";
import { ArrowLeftRight, SlidersHorizontal, Trash2 } from "lucide-react";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import { invalidateFlashcardQueries, useFlashcardDecks } from "./queries";
import { FLASHCARD_DIFFICULTY_LABEL } from "./constants";
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
  const decksQuery = useFlashcardDecks();
  const [sheet, setSheet] = useState<"move" | "level" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = selectedIds.size;

  const runBatch = async (label: string, task: (id: number) => Promise<unknown>) => {
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
        toast({ type: "success", text: `已${label} ${count} 张卡片` });
      } else {
        toast({
          type: "warning",
          text: `已${label} ${count - failed.length} 张，${failed.length} 张失败`,
        });
      }
      onFinished();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={`bg-surface shadow-float absolute bottom-[22px] left-3.5 right-3.5 z-40 flex gap-1 rounded-[20px] p-1.5 transition-transform duration-300 ${
          open && count > 0 ? "translate-y-0" : "translate-y-[140%]"
        }`}
        style={{ transitionTimingFunction: "var(--ease-bounce)" }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => setSheet("move")}
          className="text-ink bg-input flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <ArrowLeftRight size={16} className="flex-none" />
          移动卡组
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setSheet("level")}
          className="text-ink bg-input flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <SlidersHorizontal size={16} className="flex-none" />
          改难度
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="text-danger bg-input flex flex-1 items-center justify-center gap-[7px] rounded-[15px] py-3 text-[13.5px] font-extrabold disabled:opacity-50"
        >
          <Trash2 size={16} className="flex-none" />
          删除
        </button>
      </div>

      {/* 移动到卡组 */}
      <BottomSheet
        open={sheet === "move"}
        title={`移动 ${count} 张到…`}
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
                  void runBatch("移动", id => tauri.flashcardUpdateCard(id, { deckId: item.id }));
                }}
                className="bg-input active:bg-press flex items-center gap-3 rounded-[16px] p-3 text-left disabled:opacity-50"
              >
                <span className="text-[20px]">{item.emoji}</span>
                <span className="text-ink flex-1 text-[14.5px] font-extrabold">{item.name}</span>
                <span className="text-ink-3 text-[11.5px] font-semibold">
                  {item.stats?.totalCards ?? 0} 张
                </span>
              </button>
            ))}
          {(decksQuery.data ?? []).filter(item => item.id !== deckId).length === 0 ? (
            <div className="text-ink-3 py-4 text-center text-[13px] font-semibold">
              没有其他卡组可移动，先回主页创建一个
            </div>
          ) : null}
        </div>
      </BottomSheet>

      {/* 批量改难度 */}
      <BottomSheet
        open={sheet === "level"}
        title={`把 ${count} 张的难度改为…`}
        onClose={() => setSheet(null)}
      >
        <div className="flex flex-col gap-2 px-5 pb-7">
          {(Object.keys(FLASHCARD_DIFFICULTY_LABEL) as FlashcardDifficulty[]).map(level => (
            <button
              key={level}
              type="button"
              disabled={busy}
              onClick={() => {
                setSheet(null);
                void runBatch("修改难度", id =>
                  tauri.flashcardUpdateCard(id, { difficulty: level })
                );
              }}
              className="bg-input text-ink active:bg-press rounded-[16px] py-3.5 text-[14.5px] font-extrabold disabled:opacity-50"
            >
              {FLASHCARD_DIFFICULTY_LABEL[level]}
            </button>
          ))}
        </div>
      </BottomSheet>

      <MobileConfirmDialog
        open={confirmDelete}
        title={`删除 ${count} 张卡片？`}
        description="将删除所选卡片及其复习历史，不可恢复。"
        danger
        confirmText="删除"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void runBatch("删除", id => tauri.flashcardDeleteCard(id));
        }}
      />
    </>
  );
}
