import type { Dispatch, SetStateAction } from "react";
import type { CardsOverviewResponse, CardsQueryState } from "../../types";
import CardItem from "./CardItem";

type CardsPageProps = {
  cards: CardsOverviewResponse | null;
  queryState: CardsQueryState;
  totalPages: number;
  isLoadingCards: boolean;
  onPreviewCard: (cardId: number) => void;
  setQueryState: Dispatch<SetStateAction<CardsQueryState>>;
  refreshCards: (
    overrides?: Partial<CardsQueryState>,
  ) => Promise<CardsOverviewResponse>;
};

export function CardsPage(props: CardsPageProps) {
  const handleLoadMore = () => {
    if (props.queryState.page < props.totalPages && !props.isLoadingCards) {
      void props.refreshCards({
        page: props.queryState.page + 1,
      });
    }
  };

  return (
    <section className="space-y-3 pb-24">
      {props.isLoadingCards && !props.cards?.items.length ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
              <div className="mt-3 h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      ) : props.cards?.items.length ? (
        <>
          {props.cards.items.map((item) => (
            <CardItem
              key={item.id}
              item={item}
              onPreviewCard={props.onPreviewCard}
            />
          ))}

          {/* 加载更多 */}
          {props.queryState.page < props.totalPages && (
            <div className="py-4 text-center">
              {props.isLoadingCards ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    加载中...
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="text-sm text-blue-500 dark:text-blue-400"
                >
                  加载更多
                </button>
              )}
            </div>
          )}

          {props.queryState.page >= props.totalPages &&
            props.cards.items.length > 0 && (
              <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                已加载全部 {props.cards.total} 条卡片
              </p>
            )}
        </>
      ) : (
        <div className="py-20 text-center">
          <p className="text-5xl">📝</p>
          <p className="mt-4 text-base text-gray-500 dark:text-gray-400">
            还没有卡片
          </p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            点击下方 + 按钮创建第一张卡片
          </p>
        </div>
      )}
    </section>
  );
}
