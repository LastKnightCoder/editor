import React, { useState } from "react";
import classNames from "classnames";
import { ArrowRight, Brain } from "lucide-react";
import { App } from "antd";

import FlashcardReviewDeckList from "@/components/FlashcardReviewDeckList";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import useFlashcardStore from "@/stores/useFlashcardStore";
import { TabType } from "@/types/tab";
import ReviewModal from "@/pages/FlashcardCenter/ReviewModal";
import type { Flashcard, FlashcardDeck } from "@/types";

interface FlashcardPanelProps {
  reviewQueue: Flashcard[];
  decks: FlashcardDeck[];
  totalDue: number;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}

const FlashcardPanel: React.FC<FlashcardPanelProps> = ({
  reviewQueue,
  decks,
  totalDue,
  loading,
  onRefresh,
}) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const { message } = App.useApp();
  const queueReviews = useFlashcardStore((state) => state.queueReviews);
  const submitReview = useFlashcardStore((state) => state.submitReview);
  const loadingReview = useFlashcardStore((state) => state.loadingReview);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewModalQueue, setReviewModalQueue] = useState<Flashcard[]>([]);
  const [reviewingDeckId, setReviewingDeckId] = useState<number | null>(null);

  const refreshDeckQueue = async (deckId: number) => {
    const queue = await queueReviews({ deckId, limit: 30 });
    setReviewModalQueue(queue);
    return queue;
  };

  const handleStartDeckReview = async (deckId: number) => {
    const queue = await refreshDeckQueue(deckId);
    if (queue.length === 0) {
      message.info("这个卡组当前没有需要复习的闪卡");
      void onRefresh();
      return;
    }
    setReviewingDeckId(deckId);
    setReviewModalOpen(true);
  };

  return (
    <>
      <div
        className={classNames(
          "flex min-h-[180px] flex-col rounded-xl border p-4",
          themeColors.cardBorderClass,
          themeColors.cardBgClass,
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={classNames(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                themeColors.iconBgClass,
              )}
            >
              <Brain
                className={classNames("h-4 w-4", themeColors.iconTextClass)}
              />
            </div>
            <h3
              className={classNames(
                "text-sm font-semibold",
                themeColors.textClass,
              )}
            >
              待复习
            </h3>
            {totalDue > 0 && (
              <span
                className={classNames(
                  "rounded-full px-1.5 py-0.5 text-xs font-medium",
                  themeColors.badgeBgClass,
                  themeColors.badgeTextClass,
                )}
              >
                {totalDue}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => createTab(TabType.FlashcardCenter)}
            className={classNames(
              "flex items-center gap-1 text-xs transition-colors cursor-pointer",
              themeColors.secondaryTextClass,
              "hover:opacity-80",
            )}
          >
            开始复习
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <FlashcardReviewDeckList
          reviewQueue={reviewQueue}
          decks={decks}
          loading={loading || loadingReview}
          maxDecks={4}
          variant="home"
          onStartDeckReview={handleStartDeckReview}
        />
      </div>
      <ReviewModal
        open={reviewModalOpen}
        reviewQueue={reviewModalQueue}
        onSubmitReview={async (cardId, rating) => {
          const card = reviewModalQueue.find((item) => item.id === cardId);
          await submitReview({
            cardId,
            deckId: card?.deckId ?? reviewingDeckId ?? 0,
            rating,
          });
          if (reviewingDeckId != null) {
            await refreshDeckQueue(reviewingDeckId);
          }
          void onRefresh();
        }}
        onClose={() => {
          setReviewModalOpen(false);
          setReviewModalQueue([]);
          setReviewingDeckId(null);
          void onRefresh();
        }}
      />
    </>
  );
};

export default FlashcardPanel;
