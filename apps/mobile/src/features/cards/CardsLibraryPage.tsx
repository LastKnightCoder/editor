// 卡片库页：全量卡片浏览（虚拟化无限列表）。
// 与首页分离：首页只保留仪表盘 + 最近卡片预览，完整列表在这里。

import { useRef } from "react";
import { useEdgeFade } from "../../hooks/useScrollState";
import { Search } from "lucide-react";
import { CardsPage } from "./CardsPage";

type CardsLibraryPageProps = {
  onOpenSearch: () => void;
  onPreviewCard: (cardId: number) => void;
  isPreviewOpen: boolean;
  cards: Parameters<typeof CardsPage>[0]["cards"];
  queryState: Parameters<typeof CardsPage>[0]["queryState"];
  totalPages: number;
  isLoadingCards: boolean;
  setQueryState: Parameters<typeof CardsPage>[0]["setQueryState"];
  refreshCards: Parameters<typeof CardsPage>[0]["refreshCards"];
};

export function CardsLibraryPage(props: CardsLibraryPageProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(scrollRef);
  const contentRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="bg-page relative flex h-full flex-col">
      <header className="flex items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <div>
          <h1 className="text-ink text-2xl font-extrabold tracking-tight">卡片库</h1>
          <p className="text-ink-2 mt-1 text-[12.5px]">
            {props.isLoadingCards && (props.cards?.total ?? 0) === 0
              ? "加载中"
              : `${props.cards?.total ?? 0} 张卡片`}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onOpenSearch}
          aria-label="搜索卡片"
          className="bg-surface text-ink-2 shadow-card active:scale-88 grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="edge-fade-scroll dock-pad scrollbar-hide flex-1 overflow-y-auto overscroll-y-contain"
      >
        <div ref={contentRef} className="mt-3 px-[18px]">
          <CardsPage
            cards={props.cards}
            queryState={props.queryState}
            totalPages={props.totalPages}
            isLoadingCards={props.isLoadingCards}
            isPreviewOpen={props.isPreviewOpen}
            onPreviewCard={props.onPreviewCard}
            setQueryState={props.setQueryState}
            refreshCards={props.refreshCards}
            scrollContainerRef={scrollRef}
            scrollContentRef={contentRef}
          />
        </div>
      </div>
    </div>
  );
}

export default CardsLibraryPage;
