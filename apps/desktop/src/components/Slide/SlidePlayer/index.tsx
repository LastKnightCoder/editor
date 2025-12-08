import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import PortalToBody from "@/components/PortalToBody";
import SlideViewport from "../SlideViewport";
import { Editor } from "@tau/editor/src";
import {
  SlideAnimation,
  SlideDeck,
  SlidePage,
  TransitionConfig,
} from "@/types/slide";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import SlideAnimationLayer from "./SlideAnimationLayer";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";

interface SlidePlayerProps {
  deck: SlideDeck;
  pages: SlidePage[];
  initialIndex?: number;
  onExit: () => void;
}

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
    const initial = {
      opacity: 0,
      x: axis === "x" ? value : 0,
      y: axis === "y" ? value : 0,
    };
    return {
      initial,
      animate: { opacity: 1, x: 0, y: 0 },
      exit: { opacity: 0, x: -initial.x, y: -initial.y },
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

const easeMap: Record<string, string> = {
  linear: "linear",
  ease: "ease",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
};

const getElementEffectMeta = (step?: SlideAnimation) => {
  const effect = step?.effect?.type ?? "fade";
  const direction = step?.effect?.direction ?? "up";
  const duration = Math.max(0.05, (step?.effect?.duration ?? 400) / 1000);
  const easing = easeMap[step?.effect?.easing ?? "ease-out"] ?? "ease-out";
  return { effect, direction, duration, easing };
};

const applyElementVisibility = (
  el: HTMLElement,
  step: SlideAnimation | undefined,
  isVisible: boolean,
) => {
  const { effect, direction, duration, easing } = getElementEffectMeta(step);
  const transition = `opacity ${duration}s ${easing}, transform ${duration}s ${easing}`;
  el.style.transition = transition;
  el.style.willChange = "opacity, transform";
  if (isVisible) {
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.pointerEvents = "";
    el.dataset.slideHidden = "false";
    return;
  }
  el.dataset.slideHidden = "true";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  switch (effect) {
    case "slide": {
      const offset = 32;
      const axis = direction === "left" || direction === "right" ? "x" : "y";
      const value =
        direction === "left" || direction === "up" ? offset : -offset;
      el.style.transform =
        axis === "x" ? `translateX(${value}px)` : `translateY(${value}px)`;
      break;
    }
    case "zoom":
      el.style.transform = "scale(0.92)";
      break;
    case "bounce":
      el.style.transform = "scale(0.85)";
      break;
    default:
      el.style.transform = "none";
      break;
  }
};

const resetElementStyles = (el: HTMLElement) => {
  el.style.opacity = "";
  el.style.transform = "";
  el.style.transition = "";
  el.style.pointerEvents = "";
  el.style.willChange = "";
  delete el.dataset.slideHidden;
};

const SlidePlayer = ({
  deck,
  pages,
  initialIndex = 0,
  onExit,
}: SlidePlayerProps) => {
  const isDark = useSettingStore((state) => state.setting.darkMode);
  const themeColors = useThemeColors();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [animationProgress, setAnimationProgress] = useState<
    Record<number, number>
  >({});
  const contentRef = useRef<HTMLDivElement>(null);

  const currentPage = useMemo(() => pages[currentIndex], [currentIndex, pages]);
  const nextPage = useMemo(
    () => pages[currentIndex + 1],
    [currentIndex, pages],
  );

  const currentAnimationIndex = currentPage
    ? (animationProgress[currentPage.id] ?? 0)
    : 0;
  const totalAnimations = currentPage?.animations?.length ?? 0;
  const isLastPage = currentIndex >= pages.length - 1;
  const disablePrev = currentIndex === 0 && currentAnimationIndex === 0;
  const disableNext = isLastPage && currentAnimationIndex >= totalAnimations;

  const animationTargetMap = useMemo(() => {
    const map = new Map<string, SlideAnimation>();
    (currentPage?.animations ?? []).forEach((step) => {
      (step.targets ?? []).forEach((path) => {
        if (!map.has(path)) {
          map.set(path, step);
        }
      });
    });
    return map;
  }, [currentPage?.animations]);

  const activeTargetPaths = useMemo(() => {
    const set = new Set<string>();
    (currentPage?.animations ?? []).forEach((step, idx) => {
      if (idx < currentAnimationIndex) {
        (step.targets ?? []).forEach((path) => set.add(path));
      }
    });
    return set;
  }, [currentAnimationIndex, currentPage?.animations]);

  useEffect(() => {
    if (!currentPage) return;
    setAnimationProgress((prev) => {
      if (prev[currentPage.id] !== undefined) {
        return prev;
      }
      return {
        ...prev,
        [currentPage.id]: 0,
      };
    });
  }, [currentPage?.id]);

  useEffect(() => {
    setAnimationProgress({});
    setCurrentIndex(initialIndex);
  }, [deck.id, initialIndex]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      const elements = container.querySelectorAll<HTMLElement>(
        '[data-slate-node="element"]',
      );
      elements.forEach((el) => {
        const path = el.getAttribute("data-slate-path");
        if (!path) {
          resetElementStyles(el);
          return;
        }
        const step = animationTargetMap.get(path);
        if (!step) {
          resetElementStyles(el);
          return;
        }
        const isVisible = activeTargetPaths.has(path);
        applyElementVisibility(el, step, isVisible);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [animationTargetMap, activeTargetPaths, currentPage?.id]);

  const goNext = useCallback(() => {
    if (!currentPage) return;
    const currentStep = animationProgress[currentPage.id] ?? 0;
    const total = currentPage.animations?.length ?? 0;
    if (currentStep < total) {
      setAnimationProgress((prev) => ({
        ...prev,
        [currentPage.id]: currentStep + 1,
      }));
      return;
    }
    setCurrentIndex((idx) => {
      const nextIndex = Math.min(idx + 1, pages.length - 1);
      const nextPageInstance = pages[nextIndex];
      if (nextPageInstance) {
        setAnimationProgress((prev) => {
          if (prev[nextPageInstance.id] !== undefined) {
            return prev;
          }
          return {
            ...prev,
            [nextPageInstance.id]: 0,
          };
        });
      }
      return nextIndex;
    });
  }, [animationProgress, currentPage, pages]);

  const goPrev = useCallback(() => {
    if (!currentPage) return;
    const currentStep = animationProgress[currentPage.id] ?? 0;
    if (currentStep > 0) {
      setAnimationProgress((prev) => ({
        ...prev,
        [currentPage.id]: currentStep - 1,
      }));
      return;
    }
    setCurrentIndex((idx) => {
      const target = Math.max(idx - 1, 0);
      const targetPage = pages[target];
      if (targetPage) {
        setAnimationProgress((prev) => {
          const existing = prev[targetPage.id];
          const total = targetPage.animations?.length ?? 0;
          if (existing !== undefined && existing >= total) {
            return prev;
          }
          return {
            ...prev,
            [targetPage.id]: total,
          };
        });
      }
      return target;
    });
  }, [animationProgress, currentPage, pages]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      }
    },
    [goNext, goPrev, onExit],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <PortalToBody>
      <div className={classNames(
        "fixed inset-0 z-[9999] flex flex-col",
        isDark ? "bg-[#0b1121]/95 text-white" : "bg-gray-100 text-gray-900"
      )}>
        <div className="flex-1 flex gap-6 p-6">
          <div className={classNames(
            "flex-1 rounded-2xl p-4 flex flex-col shadow-2xl",
            isDark ? "bg-white/5" : "bg-white/80"
          )}>
            <div className="flex-1 min-h-0">
              <SlideViewport
                width={deck.width}
                height={deck.height}
                baseFontScale={deck.baseFontScale}
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
                        className="slide-player-editor h-full"
                      />
                      <SlideAnimationLayer
                        animations={currentPage.animations ?? []}
                        visibleCount={currentAnimationIndex}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </SlideViewport>
            </div>
            <div className={classNames(
              "flex justify-between text-sm mt-3",
              isDark ? "text-white/70" : "text-gray-600"
            )}>
              <div>
                {currentIndex + 1} / {pages.length}
              </div>
              <div>{deck.title}</div>
            </div>
          </div>
          <div className="w-80 flex flex-col gap-4">
            <div className={classNames(
              "rounded-2xl p-4 flex flex-col gap-3 backdrop-blur",
              isDark ? "bg-white/5" : "bg-white/80"
            )}>
              <div className="flex gap-3">
                {/* 次级按钮 - 透明背景，边框 */}
                <button
                  className={classNames(
                    "flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    "border disabled:opacity-50 disabled:cursor-not-allowed",
                    themeColors.borderClass,
                    isDark ? "text-white/90" : themeColors.activeTextClass,
                    themeColors.hoverClass
                  )}
                  onClick={goPrev}
                  disabled={disablePrev}
                >
                  上一页
                </button>
                {/* 主按钮 - 主题色背景 */}
                <button
                  className={classNames(
                    "flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    themeColors.primaryButtonClass,
                    // 深色模式霓虹效果
                    isDark && "shadow-lg"
                  )}
                  style={isDark ? {
                    boxShadow: `0 0 20px ${themeColors.accentColor}40, 0 4px 15px ${themeColors.accentColor}30`
                  } : undefined}
                  onClick={goNext}
                  disabled={disableNext}
                >
                  下一页
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto">
                {pages.map((page, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <div
                      key={page.id}
                      className={classNames(
                        "relative px-3 py-2 rounded-xl cursor-pointer transition-all duration-200",
                        isActive ? themeColors.activeClass : themeColors.hoverClass
                      )}
                      onClick={() => setCurrentIndex(idx)}
                    >
                      {/* 左侧指示条 */}
                      {isActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                          style={{ backgroundColor: themeColors.accentColor }}
                        />
                      )}
                      <div className={isActive ? themeColors.activeTextClass : ""}>
                        第 {page.pageIndex + 1} 页
                      </div>
                    </div>
                  );
                })}
              </div>
              {nextPage && (
                <div className="text-sm">
                  <div className={classNames(
                    "mb-2",
                    isDark ? "text-white/70" : "text-gray-600"
                  )}>下一页预览</div>
                  <div className={classNames(
                    "rounded-xl p-2 h-32 overflow-hidden",
                    isDark ? "bg-white/10" : "bg-gray-100"
                  )}>
                    <SlideViewport
                      width={deck.width}
                      height={deck.height}
                      baseFontScale={deck.baseFontScale}
                    >
                      <Editor
                        readonly
                        initValue={nextPage.content ?? DEFAULT_CARD_CONTENT}
                      />
                    </SlideViewport>
                  </div>
                </div>
              )}
              {totalAnimations > 0 && currentPage && (
                <div className="text-sm mt-3">
                  <div className={classNames(
                    "flex items-center justify-between mb-2",
                    isDark ? "text-white/80" : "text-text-2"
                  )}>
                    <span>动画步骤</span>
                    <span>
                      {Math.min(currentAnimationIndex, totalAnimations)}/
                      {totalAnimations}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                    {currentPage.animations.map((step, idx) => {
                      const isCompleted = idx < currentAnimationIndex;
                      const isCurrent =
                        currentAnimationIndex < totalAnimations &&
                        idx === currentAnimationIndex;
                      return (
                        <div
                          key={step.id}
                          className={classNames(
                            "relative rounded-xl px-3 py-2 text-xs transition-all duration-200",
                            isCompleted || isCurrent
                              ? themeColors.activeClass
                              : themeColors.hoverClass
                          )}
                        >
                          {/* 左侧指示条 */}
                          {(isCompleted || isCurrent) && (
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-r-full"
                              style={{ backgroundColor: themeColors.accentColor }}
                            />
                          )}
                          <div className={classNames(
                            "font-semibold text-sm",
                            (isCompleted || isCurrent) ? themeColors.activeTextClass : ""
                          )}>
                            {step.label || `动画步骤 ${idx + 1}`}
                          </div>
                          {step.description ? (
                            <div className={classNames(
                              "mt-1 leading-relaxed",
                              isDark ? "text-white/70" : "text-text-2"
                            )}>
                              {step.description}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className={classNames(
              "rounded-2xl p-4 flex-1 min-h-0 backdrop-blur",
              isDark ? "bg-white/5" : "bg-white/80"
            )}>
              <div className={classNames(
                "flex items-center justify-between text-sm mb-2",
                isDark ? "text-white/80" : "text-gray-700"
              )}>
                <span>演讲者笔记</span>
                <span>
                  {currentIndex + 1}/{pages.length}
                </span>
              </div>
              <div className={classNames(
                "flex-1 min-h-0 overflow-y-auto border rounded-xl p-3 slide-player-notes-container",
                isDark ? "border-white/10 bg-black/20" : "border-gray-200 bg-gray-50"
              )}>
                {currentPage?.speakerNotes ? (
                  <Editor
                    key={`notes-${currentPage.id}`}
                    readonly
                    initValue={currentPage.speakerNotes}
                    className={classNames(
                      "slide-player-notes",
                      isDark ? "text-white/90" : "text-gray-800"
                    )}
                  />
                ) : (
                  <div className={isDark ? "text-white/70" : "text-gray-500"}>暂无笔记</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className={classNames(
          "flex items-center justify-between px-6 py-4 border-t text-sm",
          isDark ? "border-white/10 text-white/70" : "border-gray-200 text-gray-600"
        )}>
          <div>按 Esc 退出演示，方向键切换页面</div>
          <button
            className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold shadow hover:bg-rose-600"
            onClick={onExit}
          >
            退出
          </button>
        </div>
      </div>
    </PortalToBody>
  );
};

export default SlidePlayer;
