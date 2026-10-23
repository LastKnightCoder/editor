import { cn } from "@tau/ui";

export interface ReleaseHistoryItem {
  releaseId: string;
  version: string;
  publishedAt: string;
  /** 本平台的最低应用版本；该版本未声明本平台时为 null。 */
  minAppVersion: string | null;
  latest?: boolean;
  compatible?: boolean;
  installed?: boolean;
}

function Mark({ children, className }: { children: string; className: string }) {
  return (
    <span className={cn("rounded-full px-1.5 py-px text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

/** 版本历史：只读展示，不把历史列表当推荐版本；标记由逻辑层给出。 */
export function ReleaseHistoryList({
  platformLabel,
  items,
}: {
  platformLabel: string;
  items: readonly ReleaseHistoryItem[];
}) {
  if (!items.length)
    return <p className="text-ink-3 py-6 text-center text-[13px]">暂无已发布版本</p>;
  return (
    <ol aria-label="版本历史" className="divide-line flex flex-col divide-y">
      {items.map(item => (
        <li
          key={item.releaseId}
          className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-2.5"
        >
          <span className="text-ink-1 font-mono text-[14px] font-semibold">v{item.version}</span>
          {item.latest && <Mark className="bg-accent-soft text-accent-text">最新</Mark>}
          {item.compatible && <Mark className="bg-ok-soft text-ok">可安装</Mark>}
          {item.installed && <Mark className="bg-info-soft text-info">已安装</Mark>}
          <span className="text-ink-3 ml-auto text-[12px]">
            {item.minAppVersion
              ? `${platformLabel}最低 ${item.minAppVersion}`
              : `未声明${platformLabel}`}
            {" · "}
            {item.publishedAt.slice(0, 10)}
          </span>
        </li>
      ))}
    </ol>
  );
}
