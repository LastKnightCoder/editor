import { useRef, useState } from "react";
import { FilterPill } from "@tau/ui";
import type { PluginCategory } from "@tau/plugins/package";
import { useNavigator } from "../../router";
import { CenterInstallSheet } from "./CenterInstallSheet";
import { PLUGIN_CATEGORIES, categoryLabel } from "./components/centerDisplay";
import { PluginListState } from "./components/PluginListState";
import { StoreEntryRow } from "./components/StoreEntryRow";
import {
  INSTALL_CLOSED_REASON,
  storePrimaryAction,
  storeTaskPhase,
} from "./components/storeActions";
import { useMobileCenterCatalog, useMobileCenterInstall } from "./data/center-queries";
import { usePluginManager } from "./data/usePluginManager";

/** 商店：按本机平台与真实宿主浏览，关键词来自顶栏搜索，安装只经中心 releaseId。 */
export function PluginStorePanel({ q }: { q: string }) {
  const install = useMobileCenterInstall();
  const navigator = useNavigator();
  const [category, setCategory] = useState<PluginCategory | null>(null);
  const [target, setTarget] = useState<{ pluginId: string; name: string } | null>(null);
  const { config, query } = useMobileCenterCatalog({ q, category });
  const manager = usePluginManager();
  const installed = new Map(manager.items.map(item => [item.id, item]));
  const pages = query.data?.pages;
  // 分类计数不受分类筛选影响；翻页与切换分类时沿用上一次首页的计数，避免分类条闪烁
  const counts = useRef<Partial<Record<PluginCategory, number>> | null>(null);
  counts.current = pages?.[0]?.categoryCounts ?? counts.current;
  const categories = PLUGIN_CATEGORIES.filter(item => (counts.current?.[item.id] ?? 0) > 0);
  const items = [
    ...new Map(pages?.flatMap(page => page.items).map(entry => [entry.pluginId, entry])).values(),
  ];
  const host = config.data?.host ?? null;
  const installationEnabled = !!config.data?.installationEnabled;
  const failure = config.error ?? (query.data ? null : query.error);
  const swallow = (action: Promise<unknown>) => void action.catch(() => undefined);

  return (
    <div className="flex flex-col gap-3">
      {config.data && !host && (
        <p className="bg-warn-soft text-warn rounded-xl px-3 py-2 text-[13px]">
          当前平台不能安装移动插件，只能浏览插件与平台声明。
        </p>
      )}
      {host && !installationEnabled && (
        <p className="bg-warn-soft text-warn rounded-xl px-3 py-2 text-[13px]">
          {INSTALL_CLOSED_REASON}，可先浏览插件与平台声明。
        </p>
      )}
      {categories.length > 0 && (
        <div role="group" aria-label="插件分类" className="-mx-4 flex gap-2 overflow-x-auto px-4">
          <FilterPill active={!category} onClick={() => setCategory(null)} label="全部" />
          {categories.map(item => (
            <FilterPill
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(item.id)}
              label={categoryLabel(item.id)}
              count={counts.current?.[item.id]}
            />
          ))}
        </div>
      )}
      <PluginListState
        status={failure ? "error" : config.isPending || query.isPending ? "loading" : "ready"}
        error={failure ? String(failure) : undefined}
        onRetry={() => void (config.isError ? config.refetch() : query.refetch())}
        retrying={config.isRefetching || query.isRefetching}
        empty={!items.length}
        emptyTitle={q || category ? "没有找到匹配的插件" : "插件中心还没有可用的插件"}
        emptyHint={q || category ? "换个关键词或分类试试。" : undefined}
        hasMore={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        loadMoreError={query.isFetchNextPageError ? String(query.error) : null}
        onLoadMore={() => void query.fetchNextPage()}
      >
        {items.map((entry, index) => (
          <StoreEntryRow
            key={entry.pluginId}
            entry={entry}
            divider={index > 0}
            primary={storePrimaryAction({
              compatibleVersion: entry.compatible?.version ?? null,
              installed: installed.get(entry.pluginId) ?? null,
              installationEnabled,
            })}
            phase={storeTaskPhase(install.task(entry.pluginId))}
            onOpen={() => navigator.push("pluginDetail", { pluginId: entry.pluginId })}
            onPrimary={() => setTarget({ pluginId: entry.pluginId, name: entry.name })}
            onCancel={() => swallow(install.cancel(entry.pluginId))}
            onRetry={() => swallow(install.retry(entry.pluginId))}
          />
        ))}
      </PluginListState>
      {target && (
        <CenterInstallSheet
          key={target.pluginId}
          pluginId={target.pluginId}
          name={target.name}
          installedVersion={installed.get(target.pluginId)?.version ?? null}
          installedPermissions={installed.get(target.pluginId)?.permissions}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
