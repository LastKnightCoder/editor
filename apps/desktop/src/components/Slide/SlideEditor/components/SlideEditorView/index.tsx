import { useMemo, useCallback } from "react";
import { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import useSlideStore from "@/stores/useSlideStore";
import SlideViewport from "@/components/Slide/SlideViewport";
import { DEFAULT_CARD_CONTENT } from "@/constants";

interface SlideEditorViewProps {
  isImmersive?: boolean;
  onExitImmersive?: () => void;
}

const cls = {
  container: "flex flex-col h-full p-4",
  header: "flex items-center gap-3 mb-4 flex-shrink-0",
  headerTitle: "text-lg font-semibold",
  headerMeta: "text-xs text-gray-500 dark:text-gray-400",
  emptyState: "flex-1 flex items-center justify-center text-gray-400 text-sm",
  canvasWrapper: "flex-1 min-h-0 flex items-center justify-center bg-gray-100 dark:bg-[#0a0d14] rounded-2xl p-4",
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
        <div className="flex-1 min-h-0 p-8 flex items-center justify-center bg-gray-100 dark:bg-[#0a0d14]">
          <div className="w-full max-w-5xl h-full">
            <SlideViewport
              width={currentDeck.width}
              height={currentDeck.height}
              baseFontScale={currentDeck.baseFontScale}
            >
              <Editor
                key={`immersive-${currentPage.id}`}
                readonly={false}
                initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
                onChange={handleContentChange}
                className="slide-editor h-full"
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
      {/* 头部 */}
      <div className={cls.header}>
        <span className={cls.headerTitle}>
          第 {currentPage.pageIndex + 1} 页
        </span>
        {currentDeck && (
          <span className={cls.headerMeta}>
            {currentDeck.width} × {currentDeck.height}
          </span>
        )}
      </div>

      {/* 所见即所得编辑区 */}
      {currentDeck && (
        <div className={cls.canvasWrapper}>
          <SlideViewport
            width={currentDeck.width}
            height={currentDeck.height}
            baseFontScale={currentDeck.baseFontScale}
          >
            <Editor
              key={`editor-${currentPage.id}`}
              readonly={false}
              initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
              onChange={handleContentChange}
              className="slide-editor h-full"
            />
          </SlideViewport>
        </div>
      )}
    </div>
  );
};

export default SlideEditorView;
