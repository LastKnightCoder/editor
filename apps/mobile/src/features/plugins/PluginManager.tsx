import { useId, useState } from "react";
import { useDebounce } from "ahooks";
import { Search } from "lucide-react";
import { usePage } from "../../router";
import { PageHeaderButton } from "../../components/PageHeader";
import { PageHeaderSearch } from "../../components/PageHeaderSearch";
import { PluginPageShell } from "./PluginPageView";
import { InstalledPluginsPanel } from "./InstalledPluginsPanel";
import { PluginStorePanel } from "./PluginStorePanel";
import { PluginHubTabs, type PluginHubTab } from "./components/PluginHubTabs";
import { usePluginManager } from "./data/usePluginManager";

/** 插件中心：右上角搜索横向展开，关键词在当前标签内生效；页面订阅应用级安装任务，切换页面不会中断安装。 */
export function PluginManager() {
  const { params } = usePage<{ tab: string }>();
  const [tab, setTab] = useState<PluginHubTab>(params.tab === "installed" ? "installed" : "store");
  const [searching, setSearching] = useState(false);
  const [input, setInput] = useState("");
  const q = useDebounce(input.trim(), { wait: 300 });
  const installedCount = usePluginManager().items.length;
  const idPrefix = useId();
  return (
    <PluginPageShell
      title="插件中心"
      actions={
        <PageHeaderButton
          icon={<Search size={20} strokeWidth={2.2} />}
          aria-label="搜索插件"
          onClick={() => setSearching(true)}
        />
      }
      header={
        searching ? (
          <PageHeaderSearch
            value={input}
            placeholder={tab === "store" ? "搜索插件中心" : "搜索已安装插件"}
            onChange={setInput}
            onCancel={() => {
              setSearching(false);
              setInput("");
            }}
          />
        ) : undefined
      }
    >
      <div className="mb-3">
        <PluginHubTabs
          idPrefix={idPrefix}
          value={tab}
          onChange={setTab}
          installedCount={installedCount}
        />
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${tab}`}
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="pb-6"
      >
        {tab === "store" ? <PluginStorePanel q={q} /> : <InstalledPluginsPanel q={q} />}
      </div>
    </PluginPageShell>
  );
}
