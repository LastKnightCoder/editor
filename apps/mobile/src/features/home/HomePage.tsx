import { useMemo } from "react";
import { NotebookPen, RefreshCw, Search } from "lucide-react";
import type {
  CardsOverviewResponse,
  DatabaseListResponse,
  SyncVersionResponse,
} from "../../types";

/* ── 工具函数 ── */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function relativeTime(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const diff = Date.now() - normalized;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(normalized).toLocaleDateString();
}

/* ── 类型 ── */

type HomePageProps = {
  databases: DatabaseListResponse | null;
  versions: SyncVersionResponse | null;
  cards: CardsOverviewResponse | null;
  onRefreshStatus: () => Promise<void>;
  onNavigateCards: () => void;
};

/* ── 首页 ── */

export function HomePage(props: HomePageProps) {
  const greeting = useMemo(() => getGreeting(), []);

  const recentCards = useMemo(() => {
    return props.cards?.items.slice(0, 5) ?? [];
  }, [props.cards?.items]);

  const lastUpdateTime = useMemo(() => {
    const first = props.cards?.items?.[0];
    return first ? relativeTime(first.updateTime) : "";
  }, [props.cards?.items]);

  const syncLabel = useMemo(() => {
    if (!props.versions) return null;
    const { localVersion, remoteVersion } = props.versions;
    if (localVersion === remoteVersion) return "已同步";
    if (localVersion > remoteVersion) return "待上传";
    return "待下载";
  }, [props.versions]);

  return (
    <section className="space-y-4 pb-6">
      {/* ── 欢迎卡片 ── */}
      <article className="glass-dark rounded-[24px] p-5 text-white">
        <p className="text-xs font-medium tracking-widest text-white/50">
          知识卡片
        </p>
        <h1 className="mt-2 text-2xl font-bold">{greeting}</h1>
        <div className="mt-4 flex items-center gap-3">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
            {props.databases?.activeDatabase ?? "未连接"}
          </span>
          {syncLabel ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                syncLabel === "已同步"
                  ? "bg-emerald-400/20 text-emerald-200"
                  : "bg-amber-400/20 text-amber-200"
              }`}
            >
              {syncLabel}
            </span>
          ) : null}
        </div>
      </article>

      {/* ── 统计卡片 ── */}
      <div className="grid grid-cols-2 gap-3">
        <article className="glass rounded-[20px] p-4">
          <p className="text-xs font-medium text-slate-400">卡片总数</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">
            {props.cards?.total ?? 0}
          </p>
        </article>
        <article className="glass rounded-[20px] p-4">
          <p className="text-xs font-medium text-slate-400">最近更新</p>
          <p className="mt-2 text-base font-semibold text-slate-800">
            {lastUpdateTime || "暂无"}
          </p>
          {props.cards?.searchMode && props.cards.searchMode !== "none" ? (
            <p className="mt-1 text-[11px] text-slate-400">
              检索：{props.cards.searchMode.toUpperCase()}
            </p>
          ) : null}
        </article>
      </div>

      {/* ── 快捷操作 ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={props.onNavigateCards}
          className="glass-accent flex items-center gap-2.5 rounded-[18px] px-4 py-3.5 text-left transition-transform active:scale-[0.97]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/15">
            <Search size={16} className="text-indigo-500" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-slate-700">搜索卡片</span>
        </button>
        <button
          type="button"
          onClick={() => void props.onRefreshStatus()}
          className="glass flex items-center gap-2.5 rounded-[18px] px-4 py-3.5 text-left transition-transform active:scale-[0.97]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-500/10">
            <RefreshCw
              size={16}
              className="text-slate-500"
              aria-hidden="true"
            />
          </span>
          <span className="text-sm font-semibold text-slate-700">刷新状态</span>
        </button>
      </div>

      {/* ── 最近卡片 ── */}
      {recentCards.length > 0 ? (
        <article className="glass rounded-[20px] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">最近更新</h2>
            <button
              type="button"
              onClick={props.onNavigateCards}
              className="text-xs font-medium text-indigo-500 active:opacity-70"
            >
              查看全部
            </button>
          </div>

          <ul className="mt-3 space-y-2.5">
            {recentCards.map((card) => (
              <li
                key={card.id}
                className="rounded-2xl bg-white/50 p-3 transition-colors active:bg-white/80"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {card.excerpt?.split("\n")[0] || `卡片 #${card.id}`}
                    </p>
                    {card.excerpt && card.excerpt.includes("\n") ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                        {card.excerpt.split("\n").slice(1).join(" ")}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-300">
                    {relativeTime(card.updateTime)}
                  </span>
                </div>
                {card.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {card.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-indigo-50/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : (
        <article className="glass rounded-[20px] p-6 text-center">
          <NotebookPen
            size={30}
            className="mx-auto text-slate-400"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-medium text-slate-500">还没有卡片</p>
          <p className="mt-1 text-xs text-slate-400">
            在桌面端创建卡片后同步到这里
          </p>
        </article>
      )}
    </section>
  );
}
