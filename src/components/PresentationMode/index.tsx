import React, { useEffect, useRef, useState, useCallback } from "react";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import PortalToBody from "@/components/PortalToBody";
import useSettingStore from "@/stores/useSettingStore";

// 导入抽离的组件和hooks
import HelpModal from "./components/HelpModal";
import OverviewMode from "./components/OverviewMode";
import useSlides from "./hooks/useSlides";
import useKeyboardNavigation from "./hooks/useKeyboardNavigation";
import useTemporaryMessage from "./hooks/useTemporaryMessage";
import styles from "./index.module.less";

// 主演示模式组件
interface PresentationModeProps {
  content: Descendant[];
  onExit: () => void;
  extensions?: any[];
}

const PresentationMode: React.FC<PresentationModeProps> = ({
  content,
  onExit,
  extensions = [],
}) => {
  const [showTip, setShowTip] = useState(true);
  const [isOverview, setIsOverview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isExitingOverview, setIsExitingOverview] = useState(false);
  const presentationEditorRef = useRef<EditorRef>(null);
  const presentationModeRef = useRef<HTMLDivElement>(null);

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
  });

  // 当前幻灯片变化时，更新编辑器内容
  useEffect(() => {
    if (slides.length > 0 && presentationEditorRef.current && !isOverview) {
      presentationEditorRef.current.setEditorValue(slides[currentSlide]);
    }
  }, [currentSlide, slides, isOverview]);

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
        className={`${styles.presentationMode}`}
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

        <div className={styles.presentationFooter}>
          {currentSlide + 1} / {slides.length}
        </div>

        {showTip && (
          <div className={styles.tipMessage}>按 ESC 退出演示模式</div>
        )}

        {message && <div className={styles.tipMessage}>{message}</div>}

        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </div>
    </PortalToBody>
  );
};

export default PresentationMode;
