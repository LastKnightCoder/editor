import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Editor } from "@tau/editor/src";
import useSlideStore from "@/stores/useSlideStore";
import SlideViewport from "@/components/Slide/SlideViewport";
import SlideController from "@/components/Slide/controller/SlideController";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import { TransitionConfig } from "@/types/slide";
import useSettingStore from "@/stores/useSettingStore";

const getTransitionMotion = (config?: TransitionConfig) => {
  const type = config?.type ?? "fade";
  const duration = (config?.duration ?? 400) / 1000;
  const direction = config?.direction ?? "right";
  const baseTransition = { duration, ease: "easeInOut" as const };

  if (type === "none") {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  if (type === "slide") {
    const offset = 80;
    const axis = direction === "up" || direction === "down" ? "y" : "x";
    const value = direction === "left" || direction === "up" ? offset : -offset;
    return {
      initial: { opacity: 0, x: axis === "x" ? value : 0, y: axis === "y" ? value : 0 },
      animate: { opacity: 1, x: 0, y: 0 },
      exit: { opacity: 0, x: axis === "x" ? -value : 0, y: axis === "y" ? -value : 0 },
      transition: baseTransition,
    };
  }

  if (type === "zoom") {
    return {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.05 },
      transition: baseTransition,
    };
  }

  if (type === "flip") {
    return {
      initial: { opacity: 0, rotateY: direction === "left" ? -90 : 90 },
      animate: { opacity: 1, rotateY: 0 },
      exit: { opacity: 0, rotateY: direction === "left" ? 90 : -90 },
      transition: { ...baseTransition, ease: "easeInOut" as const },
    };
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: baseTransition,
  };
};

const SlideAudiencePage = () => {
  const [searchParams] = useSearchParams();
  const deckIdParam = searchParams.get("deckId");
  const deckId = deckIdParam ? parseInt(deckIdParam) : null;
  const isDark = useSettingStore((state) => state.setting.darkMode);

  const { init, decks, pagesByDeck } = useSlideStore((state) => ({
    init: state.init,
    decks: state.decks,
    pagesByDeck: state.pagesByDeck,
  }));

  const [, setController] = useState<SlideController | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [showPointer, setShowPointer] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const deck = useMemo(() => decks.find((d) => d.id === deckId), [decks, deckId]);
  const pages = useMemo(
    () => (deckId ? pagesByDeck[deckId] ?? [] : []),
    [deckId, pagesByDeck]
  );

  const currentPage = pages[currentPageIndex];

  useEffect(() => {
    init();
  }, [init]);

  // 初始化控制器（作为观众端）
  useEffect(() => {
    if (!deckId || pages.length === 0) return;

    const ctrl = new SlideController(deckId, pages.length, [], "audience");

    const unsubscribe = ctrl.subscribe((state) => {
      setCurrentPageIndex(state.currentPageIndex);
      setPointerPosition(state.pointerPosition);
      setShowPointer(state.showPointer);
    });

    setController(ctrl);

    return () => {
      unsubscribe();
      ctrl.destroy();
    };
  }, [deckId, pages.length]);

  // 全屏处理
  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  // 键盘处理（仅全屏和退出）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          window.close();
        }
      } else if (event.key === "f" || event.key === "F") {
        handleFullscreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleFullscreen]);

  if (!deck || pages.length === 0) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/60">
        {deckId ? "等待演示开始..." : "未指定幻灯片文档"}
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen bg-black flex items-center justify-center cursor-none"
      onClick={handleFullscreen}
    >
      <div className="w-full h-full max-w-[100vw] max-h-[100vh] relative">
        <SlideViewport
          width={deck.width}
          height={deck.height}
          baseFontScale={deck.baseFontScale}
          background={isDark ? "#1a1f2e" : "#ffffff"}
        >
          <AnimatePresence mode="wait">
            {currentPage && (
              <motion.div
                key={currentPage.id}
                ref={contentRef}
                className="relative w-full h-full"
                {...getTransitionMotion(currentPage.transitionConfig)}
              >
                <Editor
                  readonly
                  disableStartExtensions={false}
                  initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
                  className="slide-audience-editor h-full"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </SlideViewport>

        {/* 激光笔指针 */}
        {showPointer && pointerPosition && (
          <div
            className="absolute w-6 h-6 rounded-full bg-red-500 shadow-lg shadow-red-500/50 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${pointerPosition.x}%`,
              top: `${pointerPosition.y}%`,
            }}
          />
        )}
      </div>

      {/* 页码指示器（仅在非全屏时显示） */}
      {!document.fullscreenElement && (
        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/50 rounded-lg text-white/70 text-sm">
          {currentPageIndex + 1} / {pages.length}
        </div>
      )}
    </div>
  );
};

export default SlideAudiencePage;
