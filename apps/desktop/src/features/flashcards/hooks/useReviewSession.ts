import useAnswerJudgement from "@/hooks/useAnswerJudgement";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { Flashcard, FlashcardReviewRating } from "@/types";
import { toast } from "@tau/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RATING_LABEL, judgeAnswer, suggestRating, type ReviewAnswer } from "../model";
import type { FlashcardMutations } from "../queries";
import { EMPTY_DIST } from "../reviewStyles";

interface HistoryEntry {
  index: number;
  cardId: number;
  rating: FlashcardReviewRating;
  receipt: Awaited<ReturnType<FlashcardMutations["submitReview"]>>;
}

export function useReviewSession({
  queue,
  cardsById,
  mutations,
  onExit,
}: {
  queue: number[];
  cardsById: Map<number, Flashcard>;
  mutations: Pick<FlashcardMutations, "submitReview" | "undoReview" | "setSuspended">;
  onExit(reviewed: number): void;
}) {
  const [order, setOrder] = useState(queue);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState<ReviewAnswer>({});
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [refId, setRefId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const operationPending = useRef(false);
  const startedAt = useRef(Date.now());
  const judgement = useAnswerJudgement();

  const dist = useMemo(() => {
    const out = { ...EMPTY_DIST };
    for (const h of history) out[h.rating]++;
    return out;
  }, [history]);

  // 已删除 / 已暂停的卡（复习中在别处改动）直接跳过
  const card = index < order.length ? cardsById.get(order[index]) : undefined;
  const resetJudgement = judgement.reset;
  const resetCard = useCallback(() => {
    setRevealed(false);
    setAnswer({});
    setCorrect(null);
    setHintShown(false);
    setRefId(null);
    resetJudgement();
  }, [resetJudgement]);

  useEffect(() => {
    if (!busy && index < order.length && (!card || card.status === "suspended")) {
      setOrder(prev => prev.filter((_, i) => i !== index));
      resetCard();
    }
  }, [card, index, order.length, busy, resetCard]);

  const exit = () => {
    if (!operationPending.current) onExit(history.length);
  };
  useOverlayDismiss(exit);

  const aiScore =
    judgement.status === "success" && judgement.result ? judgement.result.score : null;
  const suggestion = card ? suggestRating(card, correct, aiScore) : null;

  const submit = (override?: ReviewAnswer) => {
    if (!card || revealed) return;
    const final = override ?? answer;
    if (override) setAnswer(override);
    setCorrect(judgeAnswer(card, final));
    setRevealed(true);
    const text = final.qa?.trim();
    if (card.type === "qa" && text && judgement.isConfigured) void judgement.judge(text, card);
  };

  const rate = async (rating: FlashcardReviewRating) => {
    if (!card || !revealed || operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    try {
      const receipt = await mutations.submitReview(card, rating);
      setHistory(prev => [...prev, { index, cardId: card.id, rating, receipt }]);
      resetCard();
      setIndex(i => i + 1);
    } catch {
      toast.error("评分提交失败");
    } finally {
      operationPending.current = false;
      setBusy(false);
    }
  };

  const undo = async () => {
    const last = history[history.length - 1];
    if (!last || operationPending.current) {
      if (!last) toast.info("没有可撤销的评分");
      return;
    }
    operationPending.current = true;
    setBusy(true);
    try {
      await mutations.undoReview(last.receipt);
      setHistory(prev => prev.slice(0, -1));
      // 撤销的卡回到当前位置重新作答
      setOrder(prev => {
        const rest = prev.filter(id => id !== last.cardId);
        rest.splice(Math.min(last.index, rest.length), 0, last.cardId);
        return rest;
      });
      setIndex(Math.min(last.index, order.length));
      resetCard();
      toast.info(`已撤销「${RATING_LABEL[last.rating]}」评分`);
    } catch {
      toast.error("撤销失败");
    } finally {
      operationPending.current = false;
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!card || operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    const at = index;
    try {
      await mutations.setSuspended(card, true);
      setOrder(prev => prev.filter((_, i) => i !== at));
      resetCard();
      toast.info("已暂停这张卡片，不再进入复习", {
        action: {
          label: "撤销",
          onClick: async () => {
            if (operationPending.current) return;
            operationPending.current = true;
            setBusy(true);
            try {
              await mutations.setSuspended({ ...card, status: "suspended" }, false);
              setOrder(prev => {
                const next = prev.filter(id => id !== card.id);
                next.splice(at, 0, card.id);
                return next;
              });
              setIndex(at);
              resetCard();
            } catch {
              toast.error("恢复复习失败");
            } finally {
              operationPending.current = false;
              setBusy(false);
            }
          },
        },
      });
    } catch {
      toast.error("暂停失败");
    } finally {
      operationPending.current = false;
      setBusy(false);
    }
  };

  const skip = () => {
    if (!card || operationPending.current) return;
    setOrder(prev => [...prev.filter((_, i) => i !== index), card.id]);
    resetCard();
  };

  const pickOption = (id: string) => {
    if (!card || revealed) return;
    if (card.type === "single-choice") submit({ single: id });
    else {
      const current = answer.multi ?? [];
      setAnswer({ multi: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
    }
  };

  return {
    order,
    index,
    card,
    revealed,
    answer,
    correct,
    hintShown,
    refId,
    history,
    busy,
    startedAt,
    judgement,
    dist,
    suggestion,
    exit,
    submit,
    rate,
    undo,
    suspend,
    skip,
    pickOption,
    setHintShown,
    setAnswer,
    setRefId,
  };
}
