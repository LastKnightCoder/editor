// 复习页（overlay·全屏沉浸）：3D 翻面纸卡 + 堆叠余量 + 滑动/按钮四档评分。
// 返回手势先经 useBackHandler 弹退出确认（已答部分已实时落库，退出只放弃未答部分）；
// 复习期间屏幕常亮。队列拉取后持快照，评分逐张实时落库（中途退出不丢进度）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMobileContentKit } from "../../services/editorKit";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import { Paperclip } from "lucide-react";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { SnapSheet } from "../../components/SnapSheet";
import { useBackHandler } from "../../router";
import { useKeepScreenAwake } from "../../hooks/useKeepScreenAwake";
import { useEdgeFade } from "../../hooks/useScrollState";
import * as tauri from "../../services/tauri";
import { ReferenceEntry, ReviewCardBack, ReviewCardFront } from "./ReviewCard";
import { canSubmitAnswer, checkAnswer, type ReviewAnswer } from "./reviewFlow";
import { REVIEW_RATINGS, nextIntervalPreview } from "./constants";
import {
  invalidateFlashcardDeckStats,
  invalidateFlashcardQueries,
  fetchReviewQueue,
} from "./queries";
import type { Flashcard, FlashcardReviewRating } from "./types";

const SWIPE_COMMIT_PX = 96;

type SessionStats = {
  ratings: Array<{ rating: FlashcardReviewRating; correct: boolean }>;
  startedAt: number;
};

type FlashcardReviewPageProps = {
  /** -1 表示全库队列 */
  deckId: number;
  onRequestClose: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function FlashcardReviewPage({ deckId, onRequestClose, onError }: FlashcardReviewPageProps) {
  useKeepScreenAwake(true);

  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState<ReviewAnswer>({});
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [referenceCard, setReferenceCard] = useState<Flashcard | null>(null);
  // 滑动跟手位移（仅揭示态生效；ref 同步记录，touchend 时读最新值）
  const [swipeDx, setSwipeDx] = useState(0);
  const swipeDxRef = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  // 卡片正/背面内容滚动区：贴边内容渐隐（内容超长时上下边缘不硬切）
  const frontScrollRef = useRef<HTMLDivElement>(null);
  const backScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(frontScrollRef);
  useEdgeFade(backScrollRef);

  const ratingCounts = useMemo(() => {
    const result = { easy: 0, normal: 0, struggle: 0, hard: 0 } as Record<
      FlashcardReviewRating,
      number
    >;
    for (const item of stats?.ratings ?? []) result[item.rating] += 1;
    return result;
  }, [stats]);

  // 队列加载（含失败重试）：页面卸载后迟到的 setState 会被 React 丢弃，无需额外防护
  const loadQueue = useCallback(() => {
    fetchReviewQueue(deckId === -1 ? undefined : deckId, 20)
      .then(cards => {
        setQueue(cards);
        setStats(cards.length > 0 ? { ratings: [], startedAt: Date.now() } : null);
      })
      .catch(error => {
        setLoadFailed(true);
        onError(error, "加载复习队列失败");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const current = queue?.[index];
  const total = queue?.length ?? 0;
  const finished = queue !== null && index >= total;
  // 续批：一批复完检查是否仍有到期卡（本批评分已实时落库，重新拉队列即为剩余部分）
  const [hasMoreDue, setHasMoreDue] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!finished) return;
    let cancelled = false;
    fetchReviewQueue(deckId === -1 ? undefined : deckId, 1)
      .then(cards => {
        if (!cancelled) setHasMoreDue(cards.length > 0);
      })
      .catch(() => {
        // 探测失败时保守地保留「再来一轮」入口：点开后 startNextRound 会拉真实队列修正
        if (!cancelled) setHasMoreDue(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const startNextRound = () => {
    setLoadingMore(true);
    fetchReviewQueue(deckId === -1 ? undefined : deckId, 20)
      .then(cards => {
        if (cards.length === 0) {
          setHasMoreDue(false);
          return;
        }
        setQueue(cards);
        setIndex(0);
        resetForCard();
        setStats(prev => prev ?? { ratings: [], startedAt: Date.now() });
        setHasMoreDue(false);
      })
      .catch(error => onError(error, "加载复习队列失败"))
      .finally(() => setLoadingMore(false));
  };

  /** 退出复习：卡片列表/统计在整个会话中被刻意不刷新，这里统一补一次全量失效 */
  const closeReview = () => {
    invalidateFlashcardQueries();
    onRequestClose();
  };

  // 返回手势：可安全退出时补一次列表失效后放行弹栈（handler 内严禁调 goBack——
  // 外层 historyBack 的并发守卫会拒绝嵌套调用，手势会无声失败）；
  // 已开始复习则先确认，确认后的退出走 closeReview → goBackBypassed
  useBackHandler(() => {
    if (finished || (stats?.ratings.length ?? 0) === 0) {
      invalidateFlashcardQueries();
      return false;
    }
    setConfirmExit(true);
    return true;
  });

  const resetForCard = useCallback(() => {
    setFlipped(false);
    setAnswer({});
    setIsCorrect(null);
    setSwipeDx(0);
  }, []);

  const goToNext = useCallback(() => {
    resetForCard();
    setIndex(prev => prev + 1);
  }, [resetForCard]);

  // 提交中的同步锁：submitting 是异步 state，评分按钮连点时第二次点击仍会读到
  // false，导致同一张卡提交两次、goToNext 执行两次（index 跳两张的"跳题"缺陷）
  const submittingRef = useRef(false);
  const submitRating = useCallback(
    async (rating: FlashcardReviewRating) => {
      if (!current || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await tauri.flashcardSubmitReview(current.id, current.deckId, rating);
        // 只刷卡组统计：全量失效会让底层挂载页每评一张重拉一次全量列表
        invalidateFlashcardDeckStats();
        setStats(prev =>
          prev
            ? { ...prev, ratings: [...prev.ratings, { rating, correct: isCorrect ?? true }] }
            : prev
        );
        goToNext();
      } catch (error) {
        onError(error, "提交复习结果失败");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [current, isCorrect, goToNext, onError]
  );

  /** 正面翻到背面：作答后自动判分；未作答（如 QA 直接翻面）视为自评 */
  const reveal = useCallback(() => {
    if (!current || flipped) return;
    setIsCorrect(checkAnswer(current, answer));
    setFlipped(true);
  }, [current, flipped, answer]);

  // ── 卡片滑动手势（仅揭示态；热区为卡片本身，避开左缘返回区）──
  // 拖拽位移经 rAF 合帧写 state：touchmove 逐帧 setState 会连带整张背面子树重渲染
  const swipeFrameRef = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    if (!flipped) return;
    touchStartX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    swipeDxRef.current = 0;
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    swipeDxRef.current = event.touches[0].clientX - touchStartX.current;
    if (swipeFrameRef.current !== null) return;
    swipeFrameRef.current = requestAnimationFrame(() => {
      swipeFrameRef.current = null;
      setSwipeDx(swipeDxRef.current);
    });
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = swipeDxRef.current;
    const dy = event.changedTouches[0].clientY - (touchStartY.current ?? 0);
    touchStartX.current = null;
    touchStartY.current = null;
    swipeDxRef.current = 0;
    setSwipeDx(0);
    if (!flipped || submitting) return;
    // 横向位移须达阈值且为主导方向：背面内容纵向滚动时斜向位移不触发评分
    if (Math.abs(dx) < SWIPE_COMMIT_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx > 0) void submitRating("easy");
    else void submitRating("hard");
  };
  useEffect(
    () => () => {
      if (swipeFrameRef.current !== null) cancelAnimationFrame(swipeFrameRef.current);
    },
    []
  );

  // ── 渲染 ──
  if (queue === null && loadFailed) {
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-10">
        <div className="text-[40px]">🌧️</div>
        <div className="text-ink text-[17px] font-extrabold">复习队列加载失败</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              loadQueue();
            }}
            className="shadow-accent rounded-[16px] px-7 py-3 text-[14.5px] font-extrabold text-white"
            style={{ background: "var(--brand-grad)" }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={closeReview}
            className="text-ink-2 active:bg-press rounded-[16px] px-7 py-3 text-[14.5px] font-extrabold"
          >
            先退出
          </button>
        </div>
      </div>
    );
  }

  if (queue === null) {
    return (
      <div className="bg-page fixed inset-0 z-50 grid place-items-center">
        <div className="text-ink-2 text-[13.5px] font-bold">正在准备卡片…</div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-10">
        <div className="bg-sage-soft grid h-28 w-28 place-items-center rounded-[28px] text-[44px]">
          🗂️
        </div>
        <div className="text-center">
          <div className="text-ink text-[18px] font-extrabold">现在没有待复习的卡片</div>
          <div className="text-ink-2 mt-2 text-[13px] font-semibold">
            到期的卡片会出现在这里，先去干点别的吧
          </div>
        </div>
        <button
          type="button"
          onClick={closeReview}
          className="shadow-accent rounded-[16px] px-8 py-3 text-[14.5px] font-extrabold text-white"
          style={{ background: "var(--brand-grad)" }}
        >
          好的
        </button>
      </div>
    );
  }

  if (finished) {
    const count = stats?.ratings.length ?? 0;
    const correctCount = stats?.ratings.filter(item => item.correct).length ?? 0;
    const minutes = Math.max(
      1,
      Math.round((Date.now() - (stats?.startedAt ?? Date.now())) / 60000)
    );
    return (
      <div className="bg-page fixed inset-0 z-50 flex flex-col items-center justify-center px-7">
        <div className="bg-sage-soft grid h-[132px] w-[132px] place-items-center rounded-full text-[46px]">
          🎉
        </div>
        <div className="text-ink mt-5 text-[21px] font-extrabold">
          {hasMoreDue || loadingMore ? "这一批复习完成" : "本轮复习完成"}
        </div>
        <div className="text-ink-2 mt-2 text-[13px] font-semibold">
          {count} 张 · 用时 {minutes} 分钟 · 正确率{" "}
          {count > 0 ? Math.round((correctCount / count) * 100) : 0}%
        </div>
        <div className="mt-7 grid w-full grid-cols-4 gap-2.5">
          {REVIEW_RATINGS.map(item => (
            <div key={item.value} className="bg-surface shadow-card rounded-[18px] p-3 text-center">
              <b className="block text-[19px] font-extrabold" style={{ color: item.color }}>
                {ratingCounts[item.value]}
              </b>
              <span className="text-meta-ink mt-0.5 block text-[11px] font-bold">{item.label}</span>
            </div>
          ))}
        </div>
        {hasMoreDue ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={startNextRound}
            className="shadow-accent mt-8 w-full rounded-[17px] py-[15px] text-[15px] font-extrabold text-white disabled:opacity-60"
            style={{ background: "var(--brand-grad)" }}
          >
            {loadingMore ? "正在准备…" : "还有到期卡片，再来一轮"}
          </button>
        ) : (
          <button
            type="button"
            onClick={closeReview}
            className="shadow-accent mt-8 w-full rounded-[17px] py-[15px] text-[15px] font-extrabold text-white"
            style={{ background: "var(--brand-grad)" }}
          >
            完成
          </button>
        )}
        {hasMoreDue ? (
          <button
            type="button"
            onClick={closeReview}
            className="text-ink-3 mt-3 px-4 py-2 text-[13px] font-extrabold"
          >
            先到这里
          </button>
        ) : null}
      </div>
    );
  }

  if (!current) return null;

  // 含当前张的直觉计数：做完第 1 张（index=1）时"还剩 9"= 当前第 2 张 + 后面 8 张
  const remaining = total - index;
  const deckColor = "var(--brand)";

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {/* 顶栏：关闭 + 进度 + 计数 */}
      <div className="flex-none px-5 pt-[calc(var(--mobile-safe-top)+10px)]">
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            aria-label="退出复习"
            onClick={() => {
              if ((stats?.ratings.length ?? 0) === 0) closeReview();
              else setConfirmExit(true);
            }}
            className="bg-surface text-ink shadow-card grid h-8 w-8 place-items-center rounded-full text-[13px] active:scale-90"
          >
            ✕
          </button>
          <span className="text-ink-2 text-[12.5px] font-extrabold">
            {deckId === -1 ? "全部卡组" : "复习"} · 第 {index + 1} / {total} 张
          </span>
          <span className="text-ink-3 w-8 text-center text-[11px] font-bold">还剩{remaining}</span>
        </div>
        <div className="bg-input h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${((index + 1) / total) * 100}%`, background: "var(--brand-grad)" }}
          />
        </div>
      </div>

      {/* 3D 纸卡 + 堆叠余量 */}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-4">
        <div className="relative h-full" style={{ perspective: "1300px" }}>
          {remaining >= 2 ? (
            <div className="bg-surface shadow-card absolute inset-0 translate-y-[14px] scale-[0.965] rounded-[26px] opacity-50" />
          ) : null}
          {remaining >= 1 ? (
            <div className="bg-surface shadow-card absolute inset-0 translate-y-[7px] scale-[0.982] rounded-[26px] opacity-75" />
          ) : null}
          <div
            className="absolute inset-0 cursor-pointer"
            style={{
              transformStyle: "preserve-3d",
              // 拖拽期间禁用过渡（跟手），松手回位/翻面才走弹性动画
              transition:
                swipeDx !== 0 ? "none" : "transform 0.65s cubic-bezier(0.34, 1.56, 0.5, 1)",
              transform: flipped ? `rotateY(180deg) translateX(${-swipeDx / 4}px)` : undefined,
              // 横向评分手势只声明 pan-y，不劫持背面的纵向滚动
              touchAction: "pan-y",
            }}
            onClick={event => {
              // 点到输入控件 / 按钮时不触发翻面：按钮承担各自语义（选项选择、
              // 翻面提交一律走底部主按钮），避免“点选项即判分”的误提交
              if (
                event.target instanceof HTMLElement &&
                ["INPUT", "TEXTAREA", "BUTTON"].includes(event.target.tagName)
              )
                return;
              if (flipped) return;
              reveal();
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* 正面：色条/提示固定，中间内容区滚动（edge fade + 上下留白防贴边） */}
            <div
              className="bg-surface shadow-card absolute inset-0 flex flex-col rounded-[26px] p-5"
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
            >
              <div
                className="mb-2 h-1.5 w-full flex-none rounded-full"
                style={{ background: deckColor, opacity: 0.9 }}
              />
              <div
                ref={frontScrollRef}
                className="edge-fade-scroll -mt-1 min-h-0 flex-1 overflow-y-auto py-2"
              >
                <ReviewCardFront
                  card={current}
                  answer={answer}
                  onAnswerChange={partial => setAnswer(prev => ({ ...prev, ...partial }))}
                />
              </div>
              <div className="text-ink-3 flex-none pt-2 text-center text-[11.5px] font-bold">
                {canSubmitAnswer(current, answer)
                  ? "下方按钮翻面判分 · 或轻点卡片直接翻面"
                  : "轻点卡片翻面看答案"}
              </div>
            </div>
            {/* 背面：参考资料条钉在卡底，长内容滚动时始终可见 */}
            <div
              className="bg-surface shadow-card absolute inset-0 flex flex-col rounded-[26px] p-5"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div
                className="mb-2 h-1.5 w-full flex-none rounded-full"
                style={{ background: deckColor, opacity: 0.9 }}
              />
              <div
                ref={backScrollRef}
                className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto py-2"
              >
                <ReviewCardBack card={current} answer={answer} isCorrect={isCorrect ?? true} />
              </div>
              {current.references[0] ? (
                <div className="flex-none pt-2.5">
                  <ReferenceEntry
                    title={current.references[0].title}
                    onOpen={() => setReferenceCard(current)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* 底部：滑动提示 + 评分 */}
      <div className="flex-none px-6 pb-[calc(var(--mobile-safe-bottom)+18px)]">
        {flipped ? (
          <>
            <div className="flex items-center justify-between pb-2.5 text-[12px] font-extrabold">
              <span style={{ color: "var(--rose)" }}>← 左滑 吃力</span>
              <span className="text-ink-3">在卡片上滑动</span>
              <span style={{ color: "var(--sage)" }}>轻松 右滑 →</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {REVIEW_RATINGS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitRating(item.value)}
                  className="flex flex-col items-center gap-0.5 rounded-[17px] py-2.5 text-white active:scale-95 disabled:opacity-60"
                  style={{ background: item.color }}
                >
                  <b className="text-[14px] font-extrabold">{item.label}</b>
                  <small className="text-[9.5px] font-bold opacity-85">
                    {nextIntervalPreview(current, item.value)}
                  </small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={!canSubmitAnswer(current, answer)}
            onClick={reveal}
            className="shadow-accent w-full rounded-[17px] py-[15px] text-[15px] font-extrabold text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--brand-grad)" }}
          >
            {current.type === "qa" || current.type === "cloze"
              ? "想好了，翻面对答案"
              : "确认回答 · 翻面判分"}
          </button>
        )}
      </div>

      <MobileConfirmDialog
        open={confirmExit}
        title="退出复习"
        description={`已复习 ${stats?.ratings.length ?? 0} 张已保存，未答完的卡片下次继续。确定退出吗？`}
        confirmText="退出"
        onCancel={() => setConfirmExit(false)}
        onConfirm={() => {
          // 先关弹窗再返回：等弹窗播完 200ms 退场，避免叠在页面退场转场上慢慢消失
          setConfirmExit(false);
          window.setTimeout(closeReview, 200);
        }}
      />
      {/* 参考资料预览：SnapSheet 支持上拉全屏（normal 0.78 / full），长内容阅读友好 */}
      <SnapSheet
        open={referenceCard !== null}
        defaultState="normal"
        states={["normal", "full"]}
        normalHeight={0.78}
        onClose={() => setReferenceCard(null)}
      >
        <SnapSheet.Handle />
        <header className="border-line flex items-center gap-2 border-b border-dashed px-5 pb-2.5 pt-1">
          <Paperclip size={14} className="text-accent flex-none" />
          <span className="text-ink min-w-0 flex-1 truncate text-[14.5px] font-bold">
            {referenceCard?.references[0]?.title ?? "参考资料"}
          </span>
        </header>
        <SnapSheet.FixedFooterScroll className="px-5 pb-6 pt-2">
          {/* 用完整编辑器只读渲染（同内容详情页）：RichContent 只认基础节点，
              桌面端建的 tabs/表格/图片等富节点会被降级成纯文本 */}
          {referenceCard?.references[0]?.content ? (
            <Editor
              kit={getMobileContentKit()}
              initValue={referenceCard.references[0].content.content as Descendant[]}
              className="text-ink min-h-[160px] w-full text-[14px] font-medium leading-[1.8] outline-none"
            />
          ) : (
            <div className="text-ink-3 py-6 text-center text-[13px] font-semibold">
              原内容已被删除
            </div>
          )}
        </SnapSheet.FixedFooterScroll>
      </SnapSheet>
    </div>
  );
}
