import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import classNames from "classnames";
import { Editor } from "@tau/editor/src";
import useSlideStore from "@/stores/useSlideStore";
import SlideViewport from "@/components/Slide/SlideViewport";
import SlideController from "@/components/Slide/controller/SlideController";
import { DEFAULT_CARD_CONTENT } from "@/constants";

const cls = {
  container: "h-screen w-screen bg-[#0b1121] text-white flex flex-col overflow-hidden",
  header:
    "flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/5",
  headerTitle: "text-sm font-semibold",
  timer:
    "px-4 py-2 bg-black/30 rounded-xl text-lg font-mono tabular-nums flex items-center gap-2",
  timerButton:
    "w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs",
  main: "flex-1 flex gap-4 p-4 min-h-0",
  leftPanel: "flex-1 flex flex-col gap-4 min-w-0",
  currentSlide:
    "flex-1 bg-white/5 rounded-2xl p-4 flex flex-col min-h-0 shadow-xl",
  slideLabel: "text-xs text-white/60 mb-2",
  slideContent: "flex-1 min-h-0",
  rightPanel: "w-80 flex flex-col gap-4",
  nextSlide: "bg-white/5 rounded-2xl p-3 flex flex-col",
  nextSlideLabel: "text-xs text-white/60 mb-2",
  nextSlideContent: "h-40 rounded-xl overflow-hidden",
  notes: "flex-1 bg-white/5 rounded-2xl p-3 flex flex-col min-h-0",
  notesLabel: "text-xs text-white/60 mb-2 flex items-center justify-between",
  notesContent:
    "flex-1 min-h-0 overflow-y-auto bg-black/20 rounded-xl p-3 text-sm leading-relaxed",
  controls: "flex items-center gap-3 pt-3 border-t border-white/10 mt-3",
  navButton:
    "px-4 py-2 rounded-xl text-sm font-medium border border-white/30 hover:bg-white/10 disabled:opacity-40",
  primaryButton:
    "px-4 py-2 rounded-xl text-sm font-semibold bg-white text-indigo-600 shadow hover:bg-gray-100",
  pageNav: "flex gap-2 overflow-x-auto py-2",
  pageItem:
    "w-12 h-8 rounded-lg flex items-center justify-center text-xs cursor-pointer",
  pageItemActive: "bg-indigo-500 text-white",
  pageItemInactive: "bg-white/10 text-white/70 hover:bg-white/20",
  animationStep:
    "flex items-center gap-2 text-xs text-white/70 bg-white/10 px-3 py-1.5 rounded-lg",
  footer: "px-6 py-3 border-t border-white/10 flex items-center justify-between text-sm",
  exitButton: "px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold shadow",
  pointerButton:
    "px-3 py-2 rounded-lg text-sm border border-white/30 hover:bg-white/10",
};

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const SlidePresenterPage = () => {
  const [searchParams] = useSearchParams();
  const deckIdParam = searchParams.get("deckId");
  const deckId = deckIdParam ? parseInt(deckIdParam) : null;

  const { init, decks, pagesByDeck } = useSlideStore((state) => ({
    init: state.init,
    decks: state.decks,
    pagesByDeck: state.pagesByDeck,
  }));

  const [controller, setController] = useState<SlideController | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [animationStep, setAnimationStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const deck = useMemo(() => decks.find((d) => d.id === deckId), [decks, deckId]);
  const pages = useMemo(
    () => (deckId ? pagesByDeck[deckId] ?? [] : []),
    [deckId, pagesByDeck]
  );

  const currentPage = pages[currentPageIndex];
  const nextPage = pages[currentPageIndex + 1];
  const totalAnimations = currentPage?.animations?.length ?? 0;

  useEffect(() => {
    init();
  }, [init]);

  // 初始化控制器
  useEffect(() => {
    if (!deckId || pages.length === 0) return;

    const animationCounts = pages.map((p) => p.animations?.length ?? 0);
    const ctrl = new SlideController(deckId, pages.length, animationCounts, "presenter");

    const unsubscribe = ctrl.subscribe((state) => {
      setCurrentPageIndex(state.currentPageIndex);
      setAnimationStep(state.animationStep);
      setIsPaused(state.isPaused);
    });

    setController(ctrl);

    return () => {
      unsubscribe();
      ctrl.destroy();
    };
  }, [deckId, pages.length]);

  // 计时器
  useEffect(() => {
    if (!controller || isPaused) return;

    const interval = setInterval(() => {
      setElapsedTime(controller.getElapsedTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [controller, isPaused]);

  // 键盘导航
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!controller) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        controller.next();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        controller.prev();
      } else if (event.key === "Escape") {
        event.preventDefault();
        window.close();
      } else if (event.key === "p" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        controller.togglePointer();
      }
    },
    [controller]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!deck || pages.length === 0) {
    return (
      <div className={cls.container}>
        <div className="flex-1 flex items-center justify-center text-white/60">
          {deckId ? "加载中..." : "未指定幻灯片文档"}
        </div>
      </div>
    );
  }

  return (
    <div className={cls.container}>
      {/* 头部 */}
      <div className={cls.header}>
        <span className={cls.headerTitle}>{deck.title}</span>
        <div className={cls.timer}>
          <span>{formatTime(elapsedTime)}</span>
          <button
            className={cls.timerButton}
            onClick={() => controller?.togglePause()}
            title={isPaused ? "继续" : "暂停"}
          >
            {isPaused ? "▶" : "⏸"}
          </button>
          <button
            className={cls.timerButton}
            onClick={() => controller?.resetTimer()}
            title="重置"
          >
            ↺
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className={cls.main}>
        {/* 左侧 - 当前幻灯片 */}
        <div className={cls.leftPanel}>
          <div className={cls.currentSlide}>
            <div className={cls.slideLabel}>
              当前幻灯片 ({currentPageIndex + 1} / {pages.length})
            </div>
            <div className={cls.slideContent}>
              <SlideViewport
                width={deck.width}
                height={deck.height}
                baseFontScale={deck.baseFontScale}
                background="#fff"
              >
                <Editor
                  readonly
                  initValue={currentPage?.content ?? DEFAULT_CARD_CONTENT}
                  className="slide-presenter-current"
                />
              </SlideViewport>
            </div>
            <div className={cls.controls}>
              <button
                className={cls.navButton}
                onClick={() => controller?.prev()}
                disabled={currentPageIndex === 0 && animationStep === 0}
              >
                ← 上一步
              </button>
              <button
                className={cls.primaryButton}
                onClick={() => controller?.next()}
                disabled={
                  currentPageIndex === pages.length - 1 &&
                  animationStep >= totalAnimations
                }
              >
                下一步 →
              </button>
              {totalAnimations > 0 && (
                <div className={cls.animationStep}>
                  动画：{Math.min(animationStep, totalAnimations)} / {totalAnimations}
                </div>
              )}
            </div>
          </div>

          {/* 页面导航 */}
          <div className={cls.pageNav}>
            {pages.map((page, idx) => (
              <button
                key={page.id}
                className={classNames(
                  cls.pageItem,
                  idx === currentPageIndex ? cls.pageItemActive : cls.pageItemInactive
                )}
                onClick={() => controller?.goToPage(idx)}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧 - 预览和笔记 */}
        <div className={cls.rightPanel}>
          {/* 下一页预览 */}
          <div className={cls.nextSlide}>
            <div className={cls.nextSlideLabel}>
              {nextPage ? "下一页预览" : "最后一页"}
            </div>
            <div className={cls.nextSlideContent}>
              {nextPage ? (
                <SlideViewport
                  width={deck.width}
                  height={deck.height}
                  baseFontScale={deck.baseFontScale}
                >
                  <Editor
                    readonly
                    initValue={nextPage.content ?? DEFAULT_CARD_CONTENT}
                    className="slide-presenter-next"
                  />
                </SlideViewport>
              ) : (
                <div className="flex items-center justify-center h-full text-white/40 text-sm">
                  演示即将结束
                </div>
              )}
            </div>
          </div>

          {/* 演讲者笔记 */}
          <div className={cls.notes}>
            <div className={cls.notesLabel}>
              <span>演讲者笔记</span>
              <span className="text-white/40">第 {currentPageIndex + 1} 页</span>
            </div>
            <div className={cls.notesContent}>
              {currentPage?.speakerNotes ? (
                <Editor
                  readonly
                  initValue={currentPage.speakerNotes}
                  className="slide-presenter-notes"
                />
              ) : (
                <div className="text-white/40">暂无笔记</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className={cls.footer}>
        <div className="text-white/60">
          按 ← → 或空格键切换，Esc 退出，Ctrl+P 激光笔
        </div>
        <div className="flex items-center gap-3">
          <button
            className={cls.pointerButton}
            onClick={() => controller?.togglePointer()}
          >
            🔦 激光笔
          </button>
          <button className={cls.exitButton} onClick={() => window.close()}>
            退出演示
          </button>
        </div>
      </div>
    </div>
  );
};

export default SlidePresenterPage;
