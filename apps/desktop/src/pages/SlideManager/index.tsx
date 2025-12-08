import { useState, useMemo } from "react";
import useSlideStore from "@/stores/useSlideStore";
import { SlideWorkspace } from "@/components/Slide/SlideEditor";
import SlidePlayer from "@/components/Slide/SlidePlayer";

/**
 * SlideManagerPage - 幻灯片管理页面入口
 *
 * 职责：
 * 1. 作为路由入口
 * 2. 管理演示模式状态
 * 3. 渲染 SlideWorkspace 组件
 */
const SlideManagerPage = () => {
  const [presentDeckId, setPresentDeckId] = useState<number | null>(null);

  const { currentDeckId, pagesByDeck, decks } = useSlideStore((state) => ({
    currentDeckId: state.currentDeckId,
    pagesByDeck: state.pagesByDeck,
    decks: state.decks,
  }));

  const currentDeck = useMemo(
    () => decks.find((deck) => deck.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPages = useMemo(() => {
    if (!currentDeckId) return [];
    return pagesByDeck[currentDeckId] ?? [];
  }, [currentDeckId, pagesByDeck]);

  const handleStartPresent = () => {
    if (currentDeckId && currentPages.length > 0) {
      setPresentDeckId(currentDeckId);
    }
  };

  const handleStopPresent = () => {
    setPresentDeckId(null);
  };

  return (
    <>
      <SlideWorkspace onStartPresent={handleStartPresent} />

      {/* 演示模式 */}
      {presentDeckId && currentDeck && currentPages.length > 0 && (
        <SlidePlayer
          deck={currentDeck}
          pages={currentPages}
          onExit={handleStopPresent}
        />
      )}
    </>
  );
};

export default SlideManagerPage;
