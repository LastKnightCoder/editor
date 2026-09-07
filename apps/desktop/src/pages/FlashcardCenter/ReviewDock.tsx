import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Flashcard, FlashcardDeck } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import { REVIEW_RATINGS, formatDueTime, extractPlainText } from "@/utils/flashcard";
import ClozeReviewRenderer from "./components/ClozeReviewRenderer";

interface ReviewDockProps {
  reviewQueue: Flashcard[];
  activeDeck: FlashcardDeck | null;
  loading: boolean;
  isDark: boolean;
}

const ReviewDock = ({ reviewQueue, activeDeck, loading, isDark }: ReviewDockProps) => {
  const submitReview = useFlashcardStore(state => state.submitReview);
  const queueReviews = useFlashcardStore(state => state.queueReviews);
  const queueDeckId = useFlashcardStore(state => state.queueDeckId);
  const [revealed, setRevealed] = useState(false);

  const currentCard = reviewQueue[0];

  useEffect(() => {
    setRevealed(false);
  }, [currentCard?.id]);

  const handleRate = async (rating: (typeof REVIEW_RATINGS)[number]["value"]) => {
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
                className={`rounded-2xl border px-3 py-2 text-sm ${
                  opt.isCorrect
                    ? "border-[var(--th-success)]/60 bg-[var(--th-success)]/10 text-white"
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
          <p className="text-status-success whitespace-pre-wrap text-sm">
            {data.answer || "尚未填写答案"}
          </p>
        );
      case "boolean":
        return (
          <div className="text-status-success text-lg font-semibold">
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
  const tagClass = isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600";

  return (
    <aside
      className={`flex h-full w-[360px] flex-shrink-0 flex-col border-l p-6 backdrop-blur-lg ${containerClass}`}
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
        <p className={`mt-1 text-xs ${subTextClass}`}>
          {activeDeck ? `当前卡组：${activeDeck.name}` : "尚未选择卡组"}
        </p>
      </div>
      <div className={`mb-4 rounded-3xl p-4 ${surfaceClass}`}>
        <p className={`text-sm ${subTextClass}`}>
          待复习闪卡：
          <span className={`text-status-success font-semibold`}>{reviewQueue.length}</span>
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
      <div className={`flex flex-1 flex-col rounded-3xl p-4 ${surfaceClass}`}>
        <div className={`mb-2 flex justify-between text-xs ${subTextClass}`}>
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
          <div className={`flex flex-1 items-center justify-center ${subTextClass}`}>
            正在生成回顾队列...
          </div>
        )}
        {!loading && !currentCard && (
          <div
            className={`flex flex-1 flex-col items-center justify-center text-center ${subTextClass}`}
          >
            <p className="mb-2 text-lg font-medium">暂无可回顾的闪卡</p>
            <p className="text-sm">使用顶部按钮刷新队列或创建新闪卡后重试。</p>
          </div>
        )}
        {!loading && currentCard && (
          <>
            <div className="min-h-0 flex-1">
              <h3 className="text-lg font-semibold">{extractPlainText(currentCard.prompt)}</h3>
              {extractPlainText(currentCard.detail).trim() && (
                <p className={`mt-2 text-sm ${subTextClass}`}>
                  {extractPlainText(currentCard.detail)}
                </p>
              )}
              {currentCard.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentCard.tags.map(tag => (
                    <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${tagClass}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className={`mt-4 text-xs ${subTextClass}`}>
                下次复习：{formatDueTime(currentCard.dueTime)}
              </p>
              <button
                onClick={() => setRevealed(prev => !prev)}
                className={`bg-[var(--th-success)]/15 border-[var(--th-success)]/40 text-status-success hover:bg-[var(--th-success)]/25 mt-4 w-full rounded-2xl border py-2 text-sm transition`}
              >
                {revealed ? "隐藏答案" : "显示答案"}
              </button>
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`border-[var(--th-success)]/30 bg-[var(--th-success)]/10 mt-4 rounded-2xl border p-4`}
                  >
                    {cardAnswer}
                    {currentCard.references.length > 0 && (
                      <div
                        className={`mt-4 space-y-1 text-xs ${
                          isDark ? "text-slate-200" : "text-slate-600"
                        }`}
                      >
                        <p className={`mb-1 ${subTextClass}`}>参考资料</p>
                        {currentCard.references.map(ref => (
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
                {REVIEW_RATINGS.map(rating => (
                  <motion.button
                    key={rating.value}
                    whileTap={{ scale: 0.97 }}
                    disabled={!revealed}
                    onClick={() => handleRate(rating.value)}
                    className={`flex-1 rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors disabled:opacity-40 ${rating.bgColor} ${rating.textColor} ${rating.borderColor} ${rating.hoverBgColor}`}
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
