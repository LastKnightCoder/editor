import { cn } from "@tau/ui";

/** 详情页分段标签：文字 + 下划线，滚动时吸顶；面板由调用方以 `${idPrefix}-panel-${key}` 标识。 */
export function DetailTabs<Key extends string>({
  idPrefix,
  items,
  value,
  onChange,
}: {
  idPrefix: string;
  items: readonly { key: Key; label: string }[];
  value: Key;
  onChange: (key: Key) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="插件详情"
      className="bg-page border-line-2 sticky top-0 z-10 -mx-4 flex gap-5 overflow-x-auto border-b px-5 pt-3"
    >
      {items.map(item => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.key}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${item.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative shrink-0 whitespace-nowrap pb-2.5 text-[14px]",
              active ? "text-ink-1 font-extrabold" : "text-ink-3 font-semibold"
            )}
          >
            {item.label}
            {active && (
              <span
                aria-hidden
                className="bg-accent absolute inset-x-0 -bottom-px h-[2.5px] rounded-full"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
