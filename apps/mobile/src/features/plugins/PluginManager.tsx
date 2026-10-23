import { useId, useState } from "react";
import { usePage } from "../../router";
import { PluginPageShell } from "./PluginPageView";
import { InstalledPluginsPanel } from "./InstalledPluginsPanel";
import { PluginStorePanel } from "./PluginStorePanel";
import { PluginHubTabs, type PluginHubTab } from "./components/PluginHubTabs";
import { useMobileCenterInstall } from "./data/center-queries";

/** 插件中心：页面订阅应用级安装任务，切换页面不会中断安装。 */
export function PluginManager() {
  const { params } = usePage<{ tab: string }>();
  const [tab, setTab] = useState<PluginHubTab>(params.tab === "installed" ? "installed" : "store");
  const install = useMobileCenterInstall();
  const idPrefix = useId();
  return (
    <PluginPageShell title="插件中心">
      <div className="mb-4">
        <PluginHubTabs idPrefix={idPrefix} value={tab} onChange={setTab} />
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${tab}`}
        aria-labelledby={`${idPrefix}-tab-${tab}`}
      >
        {tab === "store" ? <PluginStorePanel install={install} /> : <InstalledPluginsPanel />}
      </div>
    </PluginPageShell>
  );
}
