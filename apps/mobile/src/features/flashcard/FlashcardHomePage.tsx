// 闪卡主页：今日待复习概览（品牌渐变主角卡）+ 卡组列表 + 卡组管理入口。
// 视觉对齐风格 D 融合版 demo（杏子 Bento 令牌）。

import { useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { useEdgeFade } from "../../hooks/useScrollState";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import {
  invalidateFlashcardQueries,
  todayReviewedCount,
  totalDueOf,
  useFlashcardDecks,
  useFlashcardReviewStats,
} from "./queries";
import { DeckFormSheet } from "./DeckFormSheet";
import type { FlashcardDeck } from "./types";

type FlashcardHomePageProps = {
  onBack: () => void;
  onOpenDeck: (deckId: number) => void;
  onOpenReview: (deckId: number | null) => void;
  onOpenStats: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function FlashcardHomePage({
  onBack,
  onOpenDeck,
  onOpenReview,
  onOpenStats,
  onError,
}: FlashcardHomePageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const decksQuery = useFlashcardDecks();
  const reviewStatsQuery = useFlashcardReviewStats(1);
  const decks = decksQuery.data ?? [];
  const reviewedToday = todayReviewedCount(reviewStatsQuery.data);
  const totalDue = totalDueOf(decks);
  const decksWithDue = decks.filter(deck => (deck.stats?.dueCards ?? 0) > 0).length;

  const [formOpen, setFormOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState<FlashcardDeck | null>(null);
  const [moreDeck, setMoreDeck] = useState<FlashcardDeck | null>(null);
  const [deletingDeck, setDeletingDeck] = useState<FlashcardDeck | null>(null);

  const moreItems: ActionSheetItem[] = moreDeck
    ? [
        {
          label: "开始复习",
          icon: "▶",
          onClick: () => {
            onOpenReview(moreDeck.id);
            setMoreDeck(null);
          },
        },
        {
          label: "编辑卡组",
          icon: "✎",
          onClick: () => {
            setEditingDeck(moreDeck);
            setFormOpen(true);
            setMoreDeck(null);
          },
        },
        {
          label: "删除卡组",
          icon: "🗑",
          danger: true,
          onClick: () => {
            setDeletingDeck(moreDeck);
            setMoreDeck(null);
          },
        },
      ]
    : [];

  const confirmDeleteDeck = async () => {
    if (!deletingDeck) return;
    try {
      await tauri.flashcardDeleteDeck(deletingDeck.id);
      invalidateFlashcardQueries();
      toast({ type: "success", text: "卡组已删除" });
    } catch (error) {
      onError(error, "删除卡组失败");
    } finally {
      setDeletingDeck(null);
    }
  };

  return (
    <div className="mobile-kb-screen bg-page flex h-full flex-col">
      <PageHeader
        title="闪卡"
        onBack={onBack}
        actions={
          <button
            type="button"
            aria-label="新建卡组"
            onClick={() => {
              setEditingDeck(null);
              setFormOpen(true);
            }}
            className="bg-surface text-ink shadow-card grid h-9 w-9 place-items-center rounded-full active:scale-90"
          >
            <Plus size={18} />
          </button>
        }
      />
      {/* 二级页无吸底 Dock，底部只留常规呼吸空间（dock-pad 是给 Dock 页面的 110px 留白） */}
      <div
        ref={scrollRef}
        className="edge-fade-scroll flex-1 overflow-y-auto"
        style={{ paddingBottom: "var(--page-bottom-inset)" }}
      >
        <div className="flex flex-col gap-[22px] px-5 pb-4 pt-2">
          {/* 今日待复习概览 */}
          <div
            className="shadow-accent rounded-[24px] p-5 text-white"
            style={{ background: "var(--brand-grad)" }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[12.5px] font-bold opacity-85">今日待复习</div>
                <div className="mt-1.5 text-[42px] font-extrabold leading-[1.15]">
                  {totalDue} <span className="text-[16px] font-bold opacity-85">张</span>
                </div>
                <div className="mt-1 text-[11.5px] font-semibold opacity-80">
                  {decks.length > 0
                    ? `${decksWithDue} 个卡组有到期卡片 · 今日已复习 ${reviewedToday} 张`
                    : "还没有卡组，先创建一个"}
                </div>
              </div>
              <button
                type="button"
                aria-label="查看复习统计"
                onClick={onOpenStats}
                className="grid h-[52px] w-[52px] place-items-center rounded-[18px] bg-white/[0.18] text-[24px] active:scale-90"
              >
                🧠
              </button>
            </div>
            {totalDue > 0 ? (
              <button
                type="button"
                onClick={() => onOpenReview(null)}
                className="text-accent mt-4 w-full rounded-[17px] bg-white py-3 text-[15px] font-extrabold active:scale-[0.98]"
              >
                开始复习
              </button>
            ) : decks.length > 0 ? (
              <div className="mt-4 rounded-[17px] bg-white/20 py-3 text-center text-[14px] font-bold">
                今日已清空，明天见 👋
              </div>
            ) : null}
          </div>

          {/* 卡组列表 */}
          <div>
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-meta-ink text-[13px] font-extrabold tracking-wide">
                卡组 · {decks.length}
              </span>
            </div>
            {decksQuery.isLoading ? (
              <div className="text-ink-3 px-1 py-6 text-center text-[13px] font-semibold">
                加载中…
              </div>
            ) : decks.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setEditingDeck(null);
                  setFormOpen(true);
                }}
                className="border-line text-ink-3 active:bg-press grid min-h-[120px] w-full place-items-center rounded-[20px] border-2 border-dashed text-[13.5px] font-extrabold"
              >
                ＋ 新建第一个卡组
              </button>
            ) : (
              <div className="flex flex-col gap-2.5">
                {decks.map(deck => {
                  const stats = deck.stats;
                  const due = stats?.dueCards ?? 0;
                  const total = stats?.totalCards ?? 0;
                  // 巩固口径与下方文案一致（total - 新卡 - 学习中），并钳制到 0-100：
                  // 全新卡组会算出负数，负 width 是非法 CSS 会被忽略而误显示满条
                  const solidCount = total - (stats?.newCards ?? 0) - (stats?.learningCards ?? 0);
                  const mastered =
                    total > 0
                      ? Math.max(0, Math.min(100, Math.round((solidCount / total) * 100)))
                      : 0;
                  return (
                    <div
                      key={deck.id}
                      className="bg-surface shadow-card active:bg-press flex items-center gap-3.5 rounded-[20px] p-4"
                      onClick={() => onOpenDeck(deck.id)}
                    >
                      <div
                        className="grid h-[46px] w-[46px] flex-none place-items-center rounded-[14px] text-[22px]"
                        style={{ background: hexToSoft(deck.coverColor) }}
                      >
                        {deck.emoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-extrabold">{deck.name}</div>
                        <div className="text-meta-ink mt-0.5 text-[12px] font-semibold">
                          {total} 张 · 巩固{" "}
                          {total - (stats?.newCards ?? 0) - (stats?.learningCards ?? 0)} · 学习中{" "}
                          {stats?.learningCards ?? 0}
                        </div>
                        <div className="bg-input mt-2 h-[5px] overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${mastered}%`, background: deck.coverColor }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="卡组操作"
                        onClick={event => {
                          event.stopPropagation();
                          setMoreDeck(deck);
                        }}
                        className="text-ink-3 active:bg-ghost-press -mr-1 grid h-8 w-8 flex-none place-items-center rounded-full"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      <div
                        className="flex-none rounded-[13px] px-2 py-1.5 text-center"
                        style={
                          due > 0
                            ? { background: "var(--brand-soft)", color: "var(--brand)" }
                            : { background: "var(--bg-input)", color: "var(--ink-3)" }
                        }
                      >
                        <div className="text-[16px] font-extrabold leading-none">{due}</div>
                        <div className="mt-0.5 text-[9.5px] font-bold opacity-75">
                          {due > 0 ? "待复习" : "已清空"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <DeckFormSheet
        open={formOpen}
        deck={editingDeck}
        onClose={() => setFormOpen(false)}
        onError={onError}
      />
      <ActionSheet
        open={moreDeck !== null}
        title={moreDeck?.name}
        items={moreItems}
        onClose={() => setMoreDeck(null)}
      />
      <MobileConfirmDialog
        open={deletingDeck !== null}
        title="删除卡组"
        description={`将删除「${deletingDeck?.name}」及其中全部卡片与复习历史，不可恢复。`}
        danger
        confirmText="删除"
        onCancel={() => setDeletingDeck(null)}
        onConfirm={() => void confirmDeleteDeck()}
      />
    </div>
  );
}

/** 桌面端创建的卡组色值可能是任意 hex（如 #2563eb），瓷贴底色统一按透明度混合 */
function hexToSoft(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "var(--bg-input)";
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}
