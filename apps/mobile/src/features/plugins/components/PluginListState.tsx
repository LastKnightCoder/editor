import { pluginTranslator, usePluginI18n } from "../i18n";
import type { ReactNode } from "react";
import { Button, Loading } from "@tau/ui";
const t = pluginTranslator.t;

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
  usePluginI18n();
  if (status === "loading") return <Loading minHeight={240} label={t("center.loading")} />;
  if (status === "error")
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-ink-1 text-[15px] font-semibold">{t("center.listFailed")}</p>
        {error && <p className="text-ink-2 text-[13px] break-words">{error}</p>}
        {onRetry && (
          <Button className="min-h-11" loading={retrying} onClick={onRetry}>
            {t("common.retry")}
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
      <ul className="bg-surface overflow-hidden rounded-[18px]">{children}</ul>
      {loadMoreError && (
        <p role="alert" className="text-danger text-center text-[13px]">
          {t("center.moreFailed", { error: loadMoreError })}
        </p>
      )}
      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button className="min-h-11" loading={loadingMore} onClick={onLoadMore}>
            {t("center.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
