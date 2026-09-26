/**
 * 沉浸复习 · 一整张纸即题卡：纸顶边一条进度细线 + 顶栏（结束 · 范围 · 本轮评分分布 · 进度）→
 * 中部题目区（720px 内容列，短时垂直居中、超高时顶对齐滚动）→ 纸底停靠操作区（作答 / 评分 + 键位提示），
 * 评分条固定在纸底，不随题目长短上下跳。队列在开始时定格，编辑后的卡面实时反映。
 *
 * 流程：作答（单选 / 判断选即提交；多选 / 填空需提交；问答可写可不写）→ 翻面（判定 · 答案 · AI 评判 ·
 * 解析 · 参考资料——点开从右侧抽屉阅读）→ 评分（1–4，按钮上是下次间隔；推荐评分描边，Space 采用）→ 下一张。
 * 问答题只在已配置模型、且写了答案时调用 AI 评判，按分数推荐评分；未配置则由用户自评。
 * 键位：A–F 选项 · ↵ 提交 · Space 显示答案 / 采用推荐 · 1–4 评分 · E 编辑 · S 暂停本卡 · ⌘Z 撤销上一张 · Esc 结束。
 */

import type { Flashcard, FlashcardDeck } from "@/types";
import { Button, cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { Layers, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { RATINGS, submitsOnPick } from "../model";
import type { FlashcardMutations } from "../queries";
import { RATING_BG } from "../reviewStyles";
import { DeckMark } from "./FlashcardBits";
import { AnswerActions } from "./review/AnswerActions";
import { CardBack } from "./review/CardBack";
import { CardFront } from "./review/CardFront";
import { CardMeta } from "./review/CardMeta";
import { DoneSummary } from "./review/DoneSummary";
import { KeyHints } from "./review/KeyHints";
import { RatingBar } from "./review/RatingBar";
import { ReferenceDrawer } from "./review/ReferenceDrawer";

import { useReviewKeyboard } from "../hooks/useReviewKeyboard";
import { useReviewSession } from "../hooks/useReviewSession";

export function ReviewSession({
  queue,
  cardsById,
  decksById,
  scope,
  mutations,
  onEdit,
  onExit,
}: {
  queue: number[];
  cardsById: Map<number, Flashcard>;
  decksById: Map<number, FlashcardDeck>;
  scope: FlashcardDeck | null;
  mutations: FlashcardMutations;
  onEdit(card: Flashcard): void;
  onExit(reviewed: number): void;
}) {
  const session = useReviewSession({ queue, cardsById, mutations, onExit });
  const {
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
  } = session;
  useReviewKeyboard({
    card,
    revealed,
    suggestion,
    busy,
    submit,
    rate,
    undo,
    suspend,
    pickOption,
    onEdit,
  });

  /* 新卡出现时聚焦首个作答输入（填空 / 问答） */
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revealed) return;
    const first = stageRef.current?.querySelector<HTMLElement>("[data-cloze] input");
    first?.focus();
  }, [card?.id, revealed]);

  const total = order.length;
  const done = index >= total;

  const progress = total ? (Math.min(index, total) / total) * 100 : 100;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 进度：贴纸顶边的一条细线，被纸的圆角自然裁出 */}
        <div
          role="progressbar"
          aria-label="复习进度"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(index, total)}
          className="absolute inset-x-0 top-0 h-0.5"
        >
          <i
            className="bg-accent ease-tau-out block h-full transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 顶栏：左侧「结束 · 范围」，右侧「评分分布 · 进度」；右侧与页头同为 32px 边距 */}
        <div className="mt-5 flex h-10 flex-none items-center gap-3 pl-6 pr-8">
          <Button size="sm" variant="ghost" icon={X} onClick={exit} disabled={busy}>
            结束
          </Button>
          <span className="text-ink-2 text-tau-meta inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {scope ? (
              <>
                <DeckMark deck={scope} size="sm" />
                <span className="truncate">{scope.name}</span>
              </>
            ) : (
              <>
                <Layers className="size-[14px]" strokeWidth={1.75} />
                全部卡组
              </>
            )}
          </span>
          <span className="flex-1" />
          <span
            className="text-ink-3 flex gap-2.5 text-[11.5px] tabular-nums"
            aria-label="本轮评分分布"
          >
            {RATINGS.map(r => (
              <span key={r.value} className="inline-flex items-center gap-1" title={r.label}>
                <i className={cn("size-1.5 rounded-full", RATING_BG[r.value])} />
                {dist[r.value]}
              </span>
            ))}
          </span>
          <span className="text-ink-2 text-tau-meta whitespace-nowrap tabular-nums">
            {done ? (
              `${total} / ${total}`
            ) : (
              <>
                <b className="text-ink-1 font-semibold">{index + 1}</b> / {total}
              </>
            )}
          </span>
        </div>

        {/* 题目区：flex 列 + 内层 margin:auto，短时垂直居中、超高时退化为顶对齐滚动而不被裁切 */}
        <FadeScroll className="flex min-h-0 flex-1 flex-col px-8 pb-8 pt-6">
          <div ref={stageRef} className="m-auto w-full max-w-[720px]">
            {done ? (
              <DoneSummary
                dist={dist}
                reviewed={history.length}
                minutes={Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000))}
                onUndo={history.length ? () => void undo() : undefined}
                onExit={exit}
              />
            ) : card ? (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <CardMeta
                  card={card}
                  deck={decksById.get(card.deckId)}
                  canUndo={history.length > 0}
                  busy={busy}
                  onEdit={() => onEdit(card)}
                  onSuspend={suspend}
                  onUndo={() => void undo()}
                  onSkip={skip}
                />
                <CardFront
                  card={card}
                  answer={answer}
                  revealed={revealed}
                  hintShown={hintShown}
                  onShowHint={() => setHintShown(true)}
                  onAnswer={setAnswer}
                  onPick={pickOption}
                  onSubmit={submit}
                />
                {revealed && (
                  <CardBack
                    card={card}
                    answer={answer}
                    correct={correct}
                    judgement={judgement}
                    activeRef={refId}
                    onOpenRef={setRefId}
                  />
                )}
              </motion.div>
            ) : null}
          </div>
        </FadeScroll>

        {/* 操作区：停靠纸底，同底色不加横线；上沿渐隐让题目自然没入（同日记输入条） */}
        {!done && card && (
          <div className="relative flex-none px-8 pb-5 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-7 before:bg-gradient-to-t before:from-[var(--tau-bg-surface)] before:to-transparent">
            <div className="mx-auto w-full max-w-[720px]">
              {/* 定高槽位：作答按钮行与评分条同高，切换时纸底不跳 */}
              <div className="flex min-h-[54px] flex-col justify-center">
                {revealed ? (
                  <RatingBar
                    card={card}
                    suggestion={suggestion}
                    busy={busy}
                    onRate={r => void rate(r)}
                  />
                ) : submitsOnPick(card) ? (
                  // 选即提交：没有按钮，键位提示独占这一行（不再重复一句操作说明）
                  <KeyHints card={card} revealed={false} className="mt-0" />
                ) : (
                  <AnswerActions card={card} onSubmit={() => submit()} />
                )}
              </div>
              {(revealed || !submitsOnPick(card)) && <KeyHints card={card} revealed={revealed} />}
            </div>
          </div>
        )}
      </div>
      <ReferenceDrawer
        reference={card?.references.find(r => r.id === refId) ?? null}
        onClose={() => setRefId(null)}
      />
    </div>
  );
}
