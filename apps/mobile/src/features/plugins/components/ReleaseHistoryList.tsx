import { cn } from "@tau/ui";

export interface ReleaseHistoryItem {
  releaseId: string;
  version: string;
  publishedAt: string;
  /** 该版本是否声明支持本平台。 */
  declared: boolean;
  /** 本机应用低于该版本对本平台的最低要求时给出要求的版本；满足或未声明时缺省。 */
  requiredAppVersion?: string;
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

function describe(item: ReleaseHistoryItem, platformLabel: string) {
  return [
    item.publishedAt.slice(0, 10),
    item.compatible && "可安装",
    !item.declared && `未声明支持${platformLabel}`,
    item.requiredAppVersion && `需 Tau ${item.requiredAppVersion} 或更高`,
  ]
    .filter(Boolean)
    .join(" · ");
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
    <ol aria-label="版本历史" className="flex flex-col">
      {items.map(item => (
        <li
          key={item.releaseId}
          // 分隔线从圆点后起画，与左侧圆点列对齐
          className="not-first:before:border-line-1 relative py-[11px] pr-3.5 pl-[34px] not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-[34px] not-first:before:border-t not-first:before:content-['']"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-[18px] left-3.5 size-2 rounded-full",
              item.installed ? "bg-accent ring-accent-soft ring-[3px]" : "bg-line-1"
            )}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-ink-1 font-mono text-[14px] font-semibold">v{item.version}</span>
            {item.latest && <Mark className="bg-accent-soft text-accent-text">最新</Mark>}
            {item.installed && <Mark className="bg-info-soft text-info">当前</Mark>}
          </div>
          <p className="text-ink-3 text-[12px]">{describe(item, platformLabel)}</p>
        </li>
      ))}
    </ol>
  );
}
