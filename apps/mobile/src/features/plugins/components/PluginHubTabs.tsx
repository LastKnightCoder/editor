import { cn } from "@tau/ui";

export type PluginHubTab = "store" | "installed";

const TABS: { id: PluginHubTab; label: string }[] = [
  { id: "store", label: "商店" },
  { id: "installed", label: "已安装" },
];

/** 插件中心的商店/已安装切换；面板由调用方以 `${idPrefix}-panel-${tab}` 标识。 */
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
    <div
      role="tablist"
      aria-label="插件中心"
      className="bg-surface shadow-card flex gap-1 rounded-2xl p-1"
    >
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
              "min-h-11 flex-1 rounded-xl text-[14px] font-semibold transition-colors",
              active ? "bg-accent-soft text-accent-text" : "text-ink-2 active:bg-press"
            )}
          >
            {tab.label}
            {tab.id === "installed" && installedCount !== undefined && (
              <span className="text-ink-3 ml-1 text-[12px] font-normal">{installedCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
