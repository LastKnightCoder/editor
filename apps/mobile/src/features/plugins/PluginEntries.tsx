import { useNavigator } from "../../router";
import { IconPuzzle } from "../settings/components/ui";
import { useInstalledPluginUpdateCount, useMobileCenterConfig } from "./data/center-queries";

/** 「我的」里的插件中心入口；插件页面入口在功能宫格里。 */
export function PluginEntries() {
  const navigator = useNavigator();
  const config = useMobileCenterConfig();
  const updates = useInstalledPluginUpdateCount();
  if (config.data?.browsingEnabled !== true) return null;
  return (
    <section aria-label="插件中心" className="list-group mt-4">
      <button
        type="button"
        className="list-item w-full gap-3 text-left"
        onClick={() => navigator.push("plugins", updates ? { tab: "installed" } : {})}
      >
        <IconPuzzle />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-ink-1 text-[14px] font-medium">插件中心</span>
          <span className="text-ink-3 text-[12px]">商店与已安装管理</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
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
