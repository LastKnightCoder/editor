import { useNavigator } from "../../router";
import { useInstalledPluginUpdateCount, useMobileCenterConfig } from "./data/center-queries";

const ROW =
  "text-ink-1 active:bg-press flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-[14px]";

/** 「我的」里的插件中心入口；插件页面入口在功能宫格里。 */
export function PluginEntries() {
  const navigator = useNavigator();
  const config = useMobileCenterConfig();
  const updates = useInstalledPluginUpdateCount();
  if (config.data?.browsingEnabled !== true) return null;
  return (
    <section aria-label="插件中心" className="bg-surface shadow-card my-4 rounded-2xl px-4 py-1.5">
      <button
        type="button"
        className={ROW}
        onClick={() => navigator.push("plugins", updates ? { tab: "installed" } : {})}
      >
        <span className="flex flex-col">
          插件中心
          <span className="text-ink-3 text-[12px]">商店与已安装管理</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {updates > 0 && (
            <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums">
              {updates} 个可更新
            </span>
          )}
          <span aria-hidden="true" className="text-ink-3">
            ›
          </span>
        </span>
      </button>
    </section>
  );
}
