import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Flashcard, FlashcardDeck } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import {
  REVIEW_RATINGS,
  formatDueTime,
  extractPlainText,
} from "@/utils/flashcard";
import ClozeReviewRenderer from "./components/ClozeReviewRenderer";

interface ReviewDockProps {
  reviewQueue: Flashcard[];
  activeDeck: FlashcardDeck | null;
  loading: boolean;
  isDark: boolean;
}

const ReviewDock = ({
  reviewQueue,
  activeDeck,
  loading,
  isDark,
}: ReviewDockProps) => {
  const submitReview = useFlashcardStore((state) => state.submitReview);
  const queueReviews = useFlashcardStore((state) => state.queueReviews);
  const queueDeckId = useFlashcardStore((state) => state.queueDeckId);
  const [revealed, setRevealed] = useState(false);

  const currentCard = reviewQueue[0];

  useEffect(() => {
    setRevealed(false);
  }, [currentCard?.id]);

  const handleRate = async (
    rating: (typeof REVIEW_RATINGS)[number]["value"],
  ) => {
    if (!currentCard || !activeDeck) return;
    await submitReview({
      cardId: currentCard.id,
      deckId: queueDeckId ?? activeDeck.id,
      rating,
    });
    setRevealed(false);
  };

  const cardAnswer = useMemo(() => {
    if (!currentCard) return null;
    const data = currentCard.data ?? {};
    switch (currentCard.type) {
      case "single-choice":
      case "multiple-choice":
        return (
          <div className="space-y-2">
            {(data.options ?? []).map((opt: any) => (
              <div
                key={opt.id}
                className={`rounded-2xl px-3 py-2 text-sm border ${
                  opt.isCorrect
                    ? "border-emerald-400/60 bg-emerald-400/10 text-white"
                    : "border-white/5 text-slate-300"
                }`}
              >
                {opt.label || "未填写"}
              </div>
            ))}
          </div>
        );
      case "cloze":
        return (
          <ClozeReviewRenderer
            richContent={currentCard.prompt}
            revealed={revealed}
            isDark={isDark}
          />
        );
      case "qa":
        return (
          <p className="text-sm text-emerald-200 whitespace-pre-wrap">
            {data.answer || "尚未填写答案"}
          </p>
        );
      case "boolean":
        return (
          <div className="text-emerald-200 text-lg font-semibold">
            {data.booleanAnswer ? "正确" : "错误"}
          </div>
        );
      default:
        return <p className="text-sm text-slate-300">暂无答案信息</p>;
    }
  }, [currentCard]);

  const containerClass = isDark
    ? "border-white/5 bg-zinc-950/40 text-white"
    : "border-slate-200 bg-white/80 text-slate-900";
  const surfaceClass = isDark
    ? "bg-white/5 border border-white/10"
    : "bg-white border border-slate-200";
  const subTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const tagClass = isDark
    ? "bg-white/10 text-slate-200"
    : "bg-slate-100 text-slate-600";

  return (
    <aside
      className={`w-[360px] flex-shrink-0 h-full border-l backdrop-blur-lg p-6 flex flex-col ${containerClass}`}
    >
      <div className="mb-4">
        <p
          className={`text-xs uppercase tracking-[0.4em] ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Review
        </p>
        <h2 className="text-xl font-semibold">回顾面板</h2>
        <p className={`text-xs mt-1 ${subTextClass}`}>
          {activeDeck ? `当前卡组：${activeDeck.name}` : "尚未选择卡组"}
        </p>
      </div>
      <div className={`rounded-3xl p-4 mb-4 ${surfaceClass}`}>
        <p className={`text-sm ${subTextClass}`}>
          待复习闪卡：
          <span
            className={`font-semibold ${
              isDark ? "text-emerald-300" : "text-emerald-600"
            }`}
          >
            {reviewQueue.length}
          </span>
        </p>
        <button
          onClick={() =>
            queueReviews({
              deckId: queueDeckId ?? activeDeck?.id ?? undefined,
              includeUpcoming: false,
              limit: 20,
            })
          }
          className={`mt-3 w-full rounded-2xl border py-2 text-xs transition ${
            isDark
              ? "border-white/10 text-slate-200 hover:bg-white/10"
              : "border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          刷新队列
        </button>
      </div>
      <div className={`flex-1 rounded-3xl p-4 flex flex-col ${surfaceClass}`}>
        <div className={`text-xs mb-2 flex justify-between ${subTextClass}`}>
          <span>
            队列所属：
            {queueDeckId
              ? queueDeckId === activeDeck?.id
                ? activeDeck?.name
                : `卡组 #${queueDeckId}`
              : (activeDeck?.name ?? "未指定")}
          </span>
          {currentCard && <span>复习 {currentCard.reviewCount} 次</span>}
        </div>
        {loading && (
          <div
            className={`flex-1 flex items-center justify-center ${subTextClass}`}
          >
            正在生成回顾队列...
          </div>
        )}
        {!loading && !currentCard && (
          <div
            className={`flex-1 flex flex-col items-center justify-center text-center ${subTextClass}`}
          >
            <p className="text-lg font-medium mb-2">暂无可回顾的闪卡</p>
            <p className="text-sm">使用顶部按钮刷新队列或创建新闪卡后重试。</p>
          </div>
        )}
        {!loading && currentCard && (
          <>
            <div className="flex-1 min-h-0">
              <h3 className="text-lg font-semibold">
                {extractPlainText(currentCard.prompt)}
              </h3>
              {extractPlainText(currentCard.detail).trim() && (
                <p className={`mt-2 text-sm ${subTextClass}`}>
                  {extractPlainText(currentCard.detail)}
                </p>
              )}
              {currentCard.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {currentCard.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`px-2 py-0.5 rounded-full text-xs ${tagClass}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className={`mt-4 text-xs ${subTextClass}`}>
                下次复习：{formatDueTime(currentCard.dueTime)}
              </p>
              <button
                onClick={() => setRevealed((prev) => !prev)}
                className={`mt-4 w-full rounded-2xl border py-2 text-sm transition ${
                  isDark
                    ? "bg-emerald-400/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-400/30"
                    : "bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200"
                }`}
              >
                {revealed ? "隐藏答案" : "显示答案"}
              </button>
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`mt-4 rounded-2xl border p-4 ${
                      isDark
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    {cardAnswer}
                    {currentCard.references.length > 0 && (
                      <div
                        className={`mt-4 space-y-1 text-xs ${
                          isDark ? "text-slate-200" : "text-slate-600"
                        }`}
                      >
                        <p className={`mb-1 ${subTextClass}`}>参考资料</p>
                        {currentCard.references.map((ref) => (
                          <div
                            key={`${ref.refType}-${ref.title}-${ref.id ?? ""}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span>{ref.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-4 space-y-2">
              <p className={`text-xs ${subTextClass}`}>复习反馈</p>
              <div className="flex gap-1.5">
                {REVIEW_RATINGS.map((rating) => (
                  <motion.button
                    key={rating.value}
                    whileTap={{ scale: 0.97 }}
                    disabled={!revealed}
                    onClick={() => handleRate(rating.value)}
                    className={`flex-1 rounded-xl px-2 py-2 text-center text-xs font-medium border transition-colors disabled:opacity-40 ${rating.bgColor} ${rating.textColor} ${rating.borderColor} ${rating.hoverBgColor}`}
                  >
                    <div>{rating.label}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

export default ReviewDock;
