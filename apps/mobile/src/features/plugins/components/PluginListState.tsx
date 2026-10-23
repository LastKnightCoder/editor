import type { ReactNode } from "react";
import { Button, Loading } from "@tau/ui";

/** 插件列表（商店与已安装）的加载、失败、空态与加载更多；宽屏两列。 */
export function PluginListState({
  status,
  error,
  onRetry,
  retrying = false,
  empty,
  emptyTitle,
  emptyHint,
  hasMore = false,
  loadingMore = false,
  loadMoreError,
  onLoadMore,
  children,
}: {
  status: "loading" | "error" | "ready";
  error?: string;
  onRetry?: () => void;
  retrying?: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyHint?: ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** 加载更多失败时的说明；已加载的条目保留。 */
  loadMoreError?: string | null;
  onLoadMore?: () => void;
  children: ReactNode;
}) {
  if (status === "loading") return <Loading minHeight={240} label="正在读取插件…" />;
  if (status === "error")
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-ink-1 text-[15px] font-semibold">插件列表暂时打不开</p>
        {error && <p className="text-ink-2 break-words text-[13px]">{error}</p>}
        {onRetry && (
          <Button className="min-h-11" loading={retrying} onClick={onRetry}>
            重试
          </Button>
        )}
      </div>
    );
  if (empty && !hasMore)
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-ink-1 text-[15px] font-semibold">{emptyTitle}</p>
        {emptyHint && <div className="text-ink-2 text-[13px] leading-relaxed">{emptyHint}</div>}
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
      {loadMoreError && (
        <p role="alert" className="text-danger text-center text-[13px]">
          加载更多失败：{loadMoreError}
        </p>
      )}
      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button className="min-h-11" loading={loadingMore} onClick={onLoadMore}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}
