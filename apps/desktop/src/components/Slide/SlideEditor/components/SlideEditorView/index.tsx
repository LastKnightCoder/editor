import { useMemo, useCallback } from "react";
import { Descendant } from "slate";
import { Editor, EditorFeatures } from "@tau/editor/src";
import useSlideStore from "@/stores/useSlideStore";
import SlideViewport from "@/components/Slide/SlideViewport";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import { SlidePageTheme } from "@/types/slide";

// 稳定的 features 配置，避免重渲染
const SLIDE_EDITOR_FEATURES: EditorFeatures = {
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

interface SlideEditorViewProps {
  isImmersive?: boolean;
  onExitImmersive?: () => void;
}

const cls = {
  container: "flex flex-col h-full p-4",
  emptyState: "flex-1 flex items-center justify-center text-gray-400 text-sm",
  canvasWrapper: "flex-1 min-h-0 flex items-center justify-center",
  immersiveHeader:
    "flex items-center justify-between p-4 bg-white/80 dark:bg-[#121625]/70 backdrop-blur border-b border-gray-200 dark:border-gray-800",
  immersiveTitle: "text-sm font-semibold",
  immersiveExitButton:
    "px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
};

const SlideEditorView = ({
  isImmersive = false,
  onExitImmersive,
}: SlideEditorViewProps) => {
  const { currentDeckId, currentPageId, pagesByDeck, decks, updatePage } =
    useSlideStore((state) => ({
      currentDeckId: state.currentDeckId,
      currentPageId: state.currentPageId,
      pagesByDeck: state.pagesByDeck,
      decks: state.decks,
      updatePage: state.updatePage,
    }));

  const currentDeck = useMemo(
    () => decks.find((d) => d.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPages = useMemo(() => {
    if (!currentDeckId) return [];
    return pagesByDeck[currentDeckId] ?? [];
  }, [currentDeckId, pagesByDeck]);

  const currentPage = useMemo(() => {
    return currentPages.find((p) => p.id === currentPageId) ?? null;
  }, [currentPageId, currentPages]);

  // 实时保存内容
  const handleContentChange = useCallback(
    (value: Descendant[]) => {
      if (!currentPage) return;
      updatePage({
        id: currentPage.id,
        content: value,
      });
    },
    [currentPage, updatePage],
  );

  // 沉浸模式布局
  if (isImmersive) {
    if (!currentPage || !currentDeck) {
      return (
        <div className={cls.emptyState}>
          请先选择一个页面
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className={cls.immersiveHeader}>
          <span className={cls.immersiveTitle}>
            {currentDeck.title} - 第 {currentPage.pageIndex + 1} 页
          </span>
          <button className={cls.immersiveExitButton} onClick={onExitImmersive}>
            退出沉浸模式 (F11)
          </button>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="w-full h-full">
            <SlideViewport
              width={currentDeck.width}
              height={currentDeck.height}
              baseFontScale={currentDeck.baseFontScale}
              backgroundImage={currentPage.background?.type === "image" ? currentPage.background.value : undefined}
            >
              <Editor
                key={`immersive-${currentPage.id}`}
                readonly={false}
                initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
                onChange={handleContentChange}
                className="slide-editor h-full"
                features={SLIDE_EDITOR_FEATURES}
                theme={getEffectiveTheme(currentPage.theme)}
              />
            </SlideViewport>
          </div>
        </div>
      </div>
    );
  }

  // 普通模式布局
  if (!currentPage) {
    return (
      <div className={cls.emptyState}>
        {currentDeckId ? "请选择一个页面" : "请先选择或创建幻灯片文档"}
      </div>
    );
  }

  return (
    <div className={cls.container}>
      {/* 所见即所得编辑区 */}
      {currentDeck && (
        <div className={cls.canvasWrapper}>
          <SlideViewport
            width={currentDeck.width}
            height={currentDeck.height}
            baseFontScale={currentDeck.baseFontScale}
            backgroundImage={currentPage.background?.type === "image" ? currentPage.background.value : undefined}
          >
            <Editor
              key={`editor-${currentPage.id}`}
              readonly={false}
              initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
              onChange={handleContentChange}
              className="slide-editor h-full"
              features={SLIDE_EDITOR_FEATURES}
              theme={getEffectiveTheme(currentPage.theme)}
            />
          </SlideViewport>
        </div>
      )}
    </div>
  );
};

export default SlideEditorView;
