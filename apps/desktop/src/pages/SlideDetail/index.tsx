import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import useSlideStore from "@/stores/useSlideStore";
import SlideWorkspace from "@/components/Slide/SlideEditor/SlideWorkspace";
import SlidePlayer from "@/components/Slide/SlidePlayer";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

const SlideDetailPage = memo(() => {
  const params = useTabParams(TabType.SlideDetail);
  const deckId = params?.id;

  const [isPresenting, setIsPresenting] = useState(false);

  const { selectDeck, currentDeckId, pagesByDeck, decks, init } = useSlideStore(
    useShallow((state) => ({
      selectDeck: state.selectDeck,
      currentDeckId: state.currentDeckId,
      pagesByDeck: state.pagesByDeck,
      decks: state.decks,
      init: state.init,
    })),
  );

  // 初始化数据
  useDatabaseChangeEffect(() => {
    init();
  });

  // 选择指定的 deck
  useEffect(() => {
    if (deckId && deckId !== currentDeckId) {
      selectDeck(deckId);
    }
  }, [deckId, currentDeckId, selectDeck]);

  const currentDeck = decks.find((d) => d.id === currentDeckId);
  const currentPages = currentDeckId ? pagesByDeck[currentDeckId] ?? [] : [];
  const sortedPages = [...currentPages].sort((a, b) => a.pageIndex - b.pageIndex);

  const handleStartPresent = () => {
    if (sortedPages.length > 0) {
      setIsPresenting(true);
    }
  };

  const handleExitPresent = () => {
    setIsPresenting(false);
  };

  if (!deckId) {
    return (
      <div className="flex items-center justify-center h-full w-full text-gray-500">
        未指定幻灯片
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden">
      <SlideWorkspace onStartPresent={handleStartPresent} />

      {/* 演示模式 */}
      {isPresenting && currentDeck && sortedPages.length > 0 && (
        <SlidePlayer
          deck={currentDeck}
          pages={sortedPages}
          onExit={handleExitPresent}
        />
      )}
    </div>
  );
});

SlideDetailPage.displayName = "SlideDetailPage";

export default SlideDetailPage;
