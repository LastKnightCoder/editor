import React, { useEffect, useRef, useState, useCallback } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import PortalToBody from "@/components/PortalToBody";
import useSettingStore from "@/stores/useSettingStore";
import classnames from "classnames";

// 导入抽离的组件和hooks
import HelpModal from "./components/HelpModal";
import OverviewMode from "./components/OverviewMode";
import useSlides from "./hooks/useSlides";
import useKeyboardNavigation from "./hooks/useKeyboardNavigation";
import useTemporaryMessage from "./hooks/useTemporaryMessage";
import useHelpModal from "./hooks/useHelpModal";
import styles from "./index.module.less";
import IExtension from "../Editor/extensions/types";

// 主演示模式组件
interface PresentationModeProps {
  content: Descendant[];
  onExit: () => void;
}

const PresentationMode: React.FC<PresentationModeProps> = ({
  content,
  onExit,
}) => {
  const [showTip, setShowTip] = useState(true);
  const [isOverview, setIsOverview] = useState(false);
  const [isExitingOverview, setIsExitingOverview] = useState(false);
  const presentationEditorRef = useRef<EditorRef>(null);
  const presentationModeRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showCloseIcon, setShowCloseIcon] = useState(false);
  const scrollbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [extensions, setExtensions] = useState<IExtension[]>([]);

  // 使用帮助弹窗hook
  const { showHelp, closeHelp, toggleHelp } = useHelpModal();

  useEffect(() => {
    import("@/editor-extensions").then((module) => {
      const {
        fileAttachmentExtension,
        dailySummaryExtension,
        projectCardListExtension,
        cardLinkExtension,
        documentCardListExtension,
        questionCardExtension,
      } = module;
      setExtensions([
        fileAttachmentExtension,
        dailySummaryExtension,
        projectCardListExtension,
        cardLinkExtension,
        documentCardListExtension,
        questionCardExtension,
      ]);
    });
  }, []);

  // 从设置中获取暗黑模式状态和切换方法
  const { darkMode, onDarkModeChange } = useSettingStore((state) => ({
    darkMode: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
  }));

  // 使用自定义hooks
  const {
    slides,
    currentSlide,
    selectedOverviewSlide,
    setSelectedOverviewSlide,
    nextSlide,
    prevSlide,
    goToSlide,
  } = useSlides(content);

  const { message, showMessage } = useTemporaryMessage();

  // 处理从全览模式进入幻灯片
  const handleEnterSlide = useMemoizedFn((index: number) => {
    goToSlide(index);
    setIsExitingOverview(true);

    // 添加动画效果，动画结束后再真正退出全览模式
    setTimeout(() => {
      setIsOverview(false);
      setIsExitingOverview(false);
    }, 300); // 动画持续时间
  });

  // 处理退出全览模式
  const handleExitOverview = useCallback(() => {
    setIsExitingOverview(true);

    setTimeout(() => {
      setIsOverview(false);
      setIsExitingOverview(false);
    }, 300);
  }, []);

  // 使用键盘导航
  useKeyboardNavigation({
    handleEnterSlide,
    handleExitOverview,
    isOverview,
    setIsOverview,
    showHelp,
    setShowHelp: toggleHelp,
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
  });

  // 当前幻灯片变化时，更新编辑器内容并滚动到顶部
  useEffect(() => {
    if (slides.length > 0 && presentationEditorRef.current && !isOverview) {
      presentationEditorRef.current.setEditorValue(slides[currentSlide]);
      // 切换Slide时滚动到顶部
      if (presentationModeRef.current) {
        presentationModeRef.current.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    }
  }, [currentSlide, slides, isOverview]);

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    if (presentationModeRef.current) {
      const scrollTop = presentationModeRef.current.scrollTop;
      // 显示/隐藏回到顶部按钮 (当滚动超过100px时显示)
      setShowBackToTop(scrollTop > 100);

      // 检测鼠标是否在顶部区域
      const isMouseNearTop = scrollTop < 50;
      setShowCloseIcon(isMouseNearTop);

      // 清除之前的定时器
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    }
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const presentationModeElement = presentationModeRef.current;
    if (presentationModeElement) {
      presentationModeElement.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (presentationModeElement) {
        presentationModeElement.removeEventListener("scroll", handleScroll);
      }
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // 监听鼠标移动事件来检测鼠标位置
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 如果鼠标在顶部50px区域内，显示关闭图标
      if (e.clientY < 100) {
        setShowCloseIcon(true);
      } else {
        setShowCloseIcon(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // 回到顶部
  const scrollToTop = useCallback(() => {
    if (presentationModeRef.current) {
      presentationModeRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }, []);

  // 3秒后隐藏提示
  useEffect(() => {
    const tipTimer = setTimeout(() => {
      setShowTip(false);
    }, 3000);

    return () => {
      clearTimeout(tipTimer);
    };
  }, []);

  return (
    <PortalToBody>
      <div
        ref={presentationModeRef}
        className={styles.presentationMode}
        onClick={(e) => e.stopPropagation()}
      >
        {isOverview ? (
          <OverviewMode
            slides={slides}
            selectedSlide={selectedOverviewSlide}
            onSelectSlide={setSelectedOverviewSlide}
            onEnterSlide={handleEnterSlide}
            extensions={extensions}
            isExiting={isExitingOverview}
          />
        ) : (
          <>
            <div className={styles.presentationContent}>
              <Editor
                ref={presentationEditorRef}
                readonly={true}
                initValue={slides[currentSlide] || []}
                extensions={extensions}
                className={styles.presentationEditor}
                style={{
                  ["--block-distance" as string]: "40px",
                }}
              />
            </div>
          </>
        )}

        {showCloseIcon && (
          <div
            className={classnames(styles.closeIcon, styles.floatingButton)}
            onClick={onExit}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            >
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </div>
        )}

        {showBackToTop && (
          <div
            className={classnames(
              styles.backToTopButton,
              styles.floatingButton,
            )}
            onClick={scrollToTop}
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            >
              <path d="M12 19V5M5 12l7-7 7 7"></path>
            </svg>
          </div>
        )}

        <div className={styles.presentationFooter}>
          {currentSlide + 1} / {slides.length}
        </div>

        {showTip && (
          <div className={styles.tipMessage}>按 ESC 退出演示模式</div>
        )}

        {message && <div className={styles.tipMessage}>{message}</div>}

        {showHelp && <HelpModal onClose={closeHelp} />}
      </div>
    </PortalToBody>
  );
};

export default PresentationMode;
