import type { Dispatch, SetStateAction } from "react";
import type { CardsOverviewResponse, CardsQueryState } from "../../types";

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

function formatTimeDisplay(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  if (isToday) {
    return `今天 ${time}`;
  } else if (isYesterday) {
    return `昨天 ${time}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

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
            <button
              key={item.id}
              type="button"
              onClick={() => props.onPreviewCard(item.id)}
              className="card w-full p-4 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-gray-100">
                    {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="shrink-0 p-1 text-gray-300 dark:text-gray-600"
                  aria-label="更多操作"
                >
                  <IconMore />
                </button>
              </div>

              {item.excerpt && item.excerpt.split("\n").length > 1 && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {item.excerpt.split("\n").slice(1).join("\n")}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatTimeDisplay(item.updateTime)}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex gap-1">
                    {item.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
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
