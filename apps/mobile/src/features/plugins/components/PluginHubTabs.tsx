import { cn } from "@tau/ui";

export type PluginHubTab = "store" | "installed";

const TABS: { id: PluginHubTab; label: string }[] = [
  { id: "store", label: "商店" },
  { id: "installed", label: "已安装" },
];

/** 插件中心的商店/已安装切换（文字标签 + 下划线）；面板由调用方以 `${idPrefix}-panel-${tab}` 标识。 */
export function PluginHubTabs({
  value,
  onChange,
  installedCount,
  idPrefix,
}: {
  value: PluginHubTab;
  onChange: (value: PluginHubTab) => void;
  installedCount?: number;
  idPrefix: string;
}) {
  return (
    <div role="tablist" aria-label="插件中心" className="flex items-end gap-6 px-1">
      {TABS.map(tab => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={event => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              onChange(tab.id === "store" ? "installed" : "store");
            }}
            className={cn(
              "relative min-h-10 pb-2 text-[15px] transition-colors",
              active ? "text-ink-1 font-extrabold" : "text-ink-3 font-semibold"
            )}
          >
            {tab.label}
            {tab.id === "installed" && installedCount !== undefined && installedCount > 0 && (
              <span className="text-ink-3 ml-1 text-[11px] font-medium">{installedCount}</span>
            )}
            {active && (
              <span
                aria-hidden
                className="bg-accent absolute bottom-0 left-1/2 h-[3px] w-[18px] -translate-x-1/2 rounded-full"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
