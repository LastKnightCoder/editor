import { useEffect } from "react";
import { Descendant } from "slate";

// 键盘事件处理hook
const useKeyboardNavigation = ({
  handleEnterSlide,
  handleExitOverview,
  isOverview,
  setIsOverview,
  showHelp,
  setShowHelp,
  darkMode,
  onDarkModeChange,
  slides,
  currentSlide,
  selectedOverviewSlide,
  setSelectedOverviewSlide,
  nextSlide,
  prevSlide,
  goToSlide,
  showMessage,
  onExit,
}: {
  handleEnterSlide: (index: number) => void;
  handleExitOverview: () => void;
  isOverview: boolean;
  setIsOverview: React.Dispatch<React.SetStateAction<boolean>>;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  slides: Descendant[][];
  currentSlide: number;
  selectedOverviewSlide: number;
  setSelectedOverviewSlide: React.Dispatch<React.SetStateAction<number>>;
  nextSlide: () => boolean;
  prevSlide: () => boolean;
  goToSlide: (index: number) => boolean;
  showMessage: (text: string) => void;
  onExit: () => void;
}) => {
  useEffect(() => {
    // 添加键盘事件监听
    const handleKeyDownEvent = async (e: KeyboardEvent) => {
      // 检查是否是帮助快捷键 (mod+h)
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        setShowHelp((prev) => !prev);
        return;
      }

      if (e.key === "f" || e.key === "F") {
        // 切换到全屏
        await document.documentElement.requestFullscreen();
        return;
      }

      if (e.key === "d" || e.key === "D") {
        // 按下d键切换主题
        onDarkModeChange(!darkMode);
        return;
      }

      if (e.key === "Escape") {
        // 如果显示帮助，先关闭帮助
        if (showHelp) {
          setShowHelp(false);
          return;
        }

        // 如果当前是全览模式，先退出全览模式
        if (isOverview) {
          handleExitOverview();
          return;
        }

        onExit();
      } else if (isOverview) {
        // 全览模式下的导航
        if (e.key === "ArrowRight") {
          setSelectedOverviewSlide((prev) =>
            Math.min(prev + 1, slides.length - 1),
          );
        } else if (e.key === "ArrowLeft") {
          setSelectedOverviewSlide((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "ArrowUp") {
          // 假设每行显示3个幻灯片
          const slidesPerRow = 3;
          setSelectedOverviewSlide((prev) => Math.max(prev - slidesPerRow, 0));
        } else if (e.key === "ArrowDown") {
          // 假设每行显示3个幻灯片
          const slidesPerRow = 3;
          setSelectedOverviewSlide((prev) =>
            Math.min(prev + slidesPerRow, slides.length - 1),
          );
        } else if (e.key === "Enter") {
          handleEnterSlide(selectedOverviewSlide);
        }
      } else {
        // 正常演示模式下的导航
        if (e.key === "ArrowRight") {
          if (!nextSlide()) {
            showMessage("已是最后一页");
          }
        } else if (e.key === "ArrowLeft") {
          if (!prevSlide()) {
            showMessage("已是第一页");
          }
        } else if (e.key === "o" || e.key === "O") {
          setIsOverview(true);
          setSelectedOverviewSlide(currentSlide);
        }
      }
    };

    // 使用更高优先级的事件监听
    window.addEventListener("keydown", handleKeyDownEvent);

    return () => {
      window.removeEventListener("keydown", handleKeyDownEvent);
    };
  }, [
    isOverview,
    setIsOverview,
    showHelp,
    setShowHelp,
    darkMode,
    onDarkModeChange,
    slides.length,
    currentSlide,
    selectedOverviewSlide,
    setSelectedOverviewSlide,
    nextSlide,
    prevSlide,
    goToSlide,
    showMessage,
    onExit,
  ]);
};

export default useKeyboardNavigation;
