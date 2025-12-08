import { useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import PortalToBody from "@/components/PortalToBody";
import SlideViewport from "../SlideViewport";
import { Editor, EditorFeatures } from "@tau/editor/src";
import { SlideDeck, SlidePage, SlidePageTheme, TransitionConfig } from "@/types/slide";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import useSettingStore from "@/stores/useSettingStore";

// 稳定的 features 配置，避免重渲染
const SLIDE_PLAYER_FEATURES: EditorFeatures = {
  disableHeaderCollapse: true,
};

// 根据页面主题设置获取实际主题
const getEffectiveTheme = (
  pageTheme: SlidePageTheme | undefined
): "light" | "dark" | undefined => {
  if (!pageTheme || pageTheme === "auto") {
    return undefined; // 跟随系统
  }
  return pageTheme;
};

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

const SlidePlayer = ({
  deck,
  pages,
  initialIndex = 0,
  onExit,
}: SlidePlayerProps) => {
  const isDark = useSettingStore((state) => state.setting.darkMode);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const currentPage = useMemo(() => pages[currentIndex], [currentIndex, pages]);

  const isFirstPage = currentIndex === 0;
  const isLastPage = currentIndex >= pages.length - 1;

  const goNext = useCallback(() => {
    if (isLastPage) return;
    setCurrentIndex((idx) => Math.min(idx + 1, pages.length - 1));
  }, [isLastPage, pages.length]);

  const goPrev = useCallback(() => {
    if (isFirstPage) return;
    setCurrentIndex((idx) => Math.max(idx - 1, 0));
  }, [isFirstPage]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
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

  // 点击切换下一页
  const handleClick = useCallback(() => {
    goNext();
  }, [goNext]);

  // 右键切换上一页
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    goPrev();
  }, [goPrev]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [deck.id, initialIndex]);

  return (
    <PortalToBody>
      <div
        className={classNames(
          "fixed inset-0 z-[9999] flex items-center justify-center",
          isDark ? "bg-[#0a0e1a]" : "bg-gray-900",
        )}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className="w-full h-full">
          <SlideViewport
            width={deck.width}
            height={deck.height}
            baseFontScale={deck.baseFontScale}
            showShadow={false}
            showRounded={false}
            backgroundImage={currentPage?.background?.type === "image" ? currentPage.background.value : undefined}
          >
            <AnimatePresence mode="wait">
              {currentPage && (
                <motion.div
                  key={currentPage.id}
                  className="relative w-full h-full"
                  {...getTransitionMotion(currentPage.transitionConfig)}
                >
                  <Editor
                    readonly
                    disableStartExtensions={false}
                    initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
                    className="slide-player-editor h-full"
                    features={SLIDE_PLAYER_FEATURES}
                    theme={getEffectiveTheme(currentPage.theme)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </SlideViewport>
        </div>
      </div>
    </PortalToBody>
  );
};

export default SlidePlayer;
