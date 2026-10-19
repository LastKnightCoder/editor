import { useState, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  CloudOff,
  ExternalLink,
  FolderOpen,
  LayoutGrid,
  Package,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { Button, FadeScroll, Input, Menu, Select, Switch, Tabs, cn } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { openExternal } from "@/commands/extra";
import { openPluginDirectory, stagePluginZip } from "@/commands/plugin-local";
import type { PluginCategory } from "@tau/plugins/package";
import type { PluginCatalogEntry, PluginCatalogSort } from "@/types/plugin-center";
import {
  PLUGIN_PORTAL_URL,
  PLUGIN_TEMPLATE_URL,
  STATE_LABELS,
  catalogCategories,
  categoryLabels,
  pendingCount,
  installState,
  installedPlugins,
  matchesQuery,
  needsAttention,
  type InstalledPlugin,
} from "../model";
import { usePluginCatalog } from "../queries";
import { usePluginControl } from "../usePluginControl";
import { PluginIcon } from "../components/PluginIcon";
import {
  InstallButton,
  MoreButton,
  RestartBar,
  SourceChip,
  StagedChip,
  UninstallDialog,
} from "../components/PluginParts";

type PluginsTab = "discover" | "installed" | "updates";
const TABS: readonly PluginsTab[] = ["discover", "installed", "updates"];

export function PluginsView() {
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const { navigator } = usePage();
  const params = usePageParams<{ tab?: string }>();
  const tab = TABS.find(item => item === params.tab) ?? "discover";
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [sort, setSort] = useState<PluginCatalogSort>("downloads7d");
  const [category, setCategory] = useState<PluginCategory | null>(null);
  const catalog = usePluginCatalog("", tab === "discover" ? sort : "updated");
  const installed = runtime ? installedPlugins(runtime) : [];
  const updates = (catalog.data?.items ?? []).flatMap(entry => {
    const plugin = installed.find(item => item.info.id === entry.pluginId);
    const state = installState(entry, plugin, plugin?.update);
    return plugin && (state.kind === "update" || state.kind === "staged") ? [entry] : [];
  });
  const openDetail = (pluginId: string) => navigator.push("plugin-detail", { pluginId });
  const run = (action: () => Promise<unknown>) => {
    setActionError("");
    void Promise.resolve()
      .then(action)
      .catch(cause => setActionError(cause instanceof Error ? cause.message : "操作失败"));
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">插件</h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate">
              扩展页面、侧边栏、命令与摘录来源
            </span>
            {tab === "discover" && (
              <CategoryMenu
                entries={catalog.data?.items ?? []}
                value={category}
                onChange={setCategory}
              />
            )}
            {tab === "discover" && (
              <Select
                size="sm"
                aria-label="插件排序"
                disabled={!catalog.data?.windowStart}
                value={catalog.data?.windowStart ? sort : "updated"}
                onValueChange={value => setSort(value as PluginCatalogSort)}
                options={[
                  { value: "downloads7d", label: "最近热门" },
                  { value: "downloadsTotal", label: "下载最多" },
                  { value: "updated", label: "最近更新" },
                ]}
              />
            )}
            <Input
              size="sm"
              lead={Search}
              clearable
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索插件"
              className="w-0"
              wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
            />
            <MoreButton label="更多插件操作">
              {runtime?.local && (
                <>
                  {import.meta.env.DEV && (
                    <Menu.Item
                      icon={<Package strokeWidth={1.75} />}
                      onSelect={() =>
                        run(async () => {
                          await stagePluginZip();
                          await runtime.local?.refresh();
                        })
                      }
                    >
                      从 ZIP 安装…
                    </Menu.Item>
                  )}
                  <Menu.Item
                    icon={<FolderOpen strokeWidth={1.75} />}
                    onSelect={() => run(openPluginDirectory)}
                  >
                    打开插件目录
                  </Menu.Item>
                  <Menu.Item
                    icon={<RefreshCw strokeWidth={1.75} />}
                    onSelect={() => run(async () => runtime.local?.refresh())}
                  >
                    重新扫描
                  </Menu.Item>
                  <Menu.Separator />
                </>
              )}
              <Menu.Item
                icon={<BookOpen strokeWidth={1.75} />}
                onSelect={() => void openExternal(PLUGIN_TEMPLATE_URL)}
              >
                开发插件文档
              </Menu.Item>
              <Menu.Item
                icon={<ExternalLink strokeWidth={1.75} />}
                onSelect={() => void openExternal(PLUGIN_PORTAL_URL)}
              >
                发布门户
              </Menu.Item>
            </MoreButton>
          </div>
          <Tabs<PluginsTab>
            className="mt-3"
            activeKey={tab}
            onChange={key => navigator.push("plugins", { tab: key })}
            items={[
              { key: "discover", label: "发现", children: null },
              { key: "installed", label: `已安装 ${installed.length}`, children: null },
              {
                key: "updates",
                label: updates.length ? `更新 ${updates.length}` : "更新",
                children: null,
              },
            ]}
          />
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px] pt-4">
          <div className="mb-4 flex flex-col gap-2 empty:hidden">
            <RestartBar count={pendingCount(runtime)} />
            {tab === "discover" && catalog.data && catalog.error && (
              <p role="alert" className="text-tau-meta text-danger">
                目录刷新失败，正在显示上次结果。{catalog.error}
              </p>
            )}
            {(actionError || startupError || runtime?.local?.scanError) && (
              <p role="alert" className="text-tau-meta text-danger">
                {actionError || startupError || runtime?.local?.scanError}
              </p>
            )}
          </div>
          {!runtime ? (
            <p className="text-tau-body text-ink-2">{startupError ? "" : "正在准备插件管理…"}</p>
          ) : tab === "discover" ? (
            <Discover
              runtime={runtime}
              installed={installed}
              query={query}
              category={category}
              catalog={catalog}
              onOpen={openDetail}
              onClearCategory={() => setCategory(null)}
            />
          ) : tab === "installed" ? (
            <Installed runtime={runtime} installed={installed} query={query} onOpen={openDetail} />
          ) : (
            <Updates
              installed={installed}
              entries={updates.filter(entry => matchesQuery([entry.name], query))}
              catalogError={catalog.error}
              onOpen={openDetail}
            />
          )}
        </FadeScroll>
      </div>
    </div>
  );
}

/** 分类单选菜单；目录里没有任何分类时不渲染 */
function CategoryMenu({
  entries,
  value,
  onChange,
}: {
  entries: readonly PluginCatalogEntry[];
  value: PluginCategory | null;
  onChange: (value: PluginCategory | null) => void;
}) {
  const items = catalogCategories(entries);
  if (!items.length && !value) return null;
  const label = items.find(item => item.id === value)?.label ?? "全部分类";
  return (
    <Menu
      align="end"
      trigger={
        <Button variant="ghost" size="sm" icon={LayoutGrid} aria-label={`插件分类：${label}`}>
          {label}
          <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
        </Button>
      }
    >
      <Menu.RadioGroup
        value={value ?? ""}
        onValueChange={next => onChange((next || null) as PluginCategory | null)}
      >
        <Menu.RadioItem value="">全部分类</Menu.RadioItem>
        {items.map(item => (
          <Menu.RadioItem key={item.id} value={item.id}>
            {item.label}
            <span className="text-ink-3 ml-auto pl-4 tabular-nums">{item.count}</span>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu>
  );
}

function Discover({
  runtime,
  installed,
  query,
  category,
  catalog,
  onOpen,
  onClearCategory,
}: {
  runtime: DesktopPluginRuntime;
  installed: InstalledPlugin[];
  query: string;
  category: PluginCategory | null;
  catalog: ReturnType<typeof usePluginCatalog>;
  onOpen: (id: string) => void;
  onClearCategory: () => void;
}) {
  if (catalog.loading) return <p className="text-tau-body text-ink-2">正在读取插件中心…</p>;
  if (!catalog.data)
    return (
      <Empty icon={<CloudOff />} title="暂时连不上插件中心">
        <p>已安装的插件照常运行。{catalog.error}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={catalog.refresh}>
          重试
        </Button>
      </Empty>
    );
  const entries = catalog.data.items.filter(
    entry =>
      (!category || entry.categories?.includes(category)) &&
      matchesQuery(
        [entry.pluginId, entry.name, entry.description, ...(entry.keywords ?? [])],
        query
      )
  );
  if (!entries.length && category)
    return (
      <Empty
        icon={<SearchX />}
        title={query ? `该分类下没有「${query.trim()}」` : "该分类下暂无插件"}
      >
        <Button variant="secondary" size="sm" className="mt-2" onClick={onClearCategory}>
          查看全部分类
        </Button>
      </Empty>
    );
  if (!entries.length)
    return (
      <Empty
        icon={<SearchX />}
        title={query ? `没有找到「${query.trim()}」` : "插件中心还没有插件"}
      >
        <p>想要的功能可以自己做一个。</p>
        <Button
          variant="ghost"
          size="sm"
          icon={BookOpen}
          className="mt-2"
          onClick={() => void openExternal(PLUGIN_TEMPLATE_URL)}
        >
          查看作者文档
        </Button>
      </Empty>
    );
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
      {entries.map(entry => (
        <CatalogCard
          key={entry.pluginId}
          entry={entry}
          runtime={runtime}
          installed={installed.find(item => item.info.id === entry.pluginId)}
          onOpen={() => onOpen(entry.pluginId)}
        />
      ))}
    </div>
  );
}

function CatalogCard({
  entry,
  runtime,
  installed,
  onOpen,
}: {
  entry: PluginCatalogEntry;
  runtime: DesktopPluginRuntime;
  installed?: InstalledPlugin;
  onOpen: () => void;
}) {
  const pending = runtime.local?.updates.find(item => item.id === entry.pluginId);
  return (
    <article
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" && event.target === event.currentTarget) onOpen();
      }}
      className="border-line-1 ease-tau-out hover:shadow-lift flex min-h-[168px] cursor-pointer flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-4 transition-[box-shadow,border-color] duration-200 hover:border-transparent focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-center gap-3">
        <PluginIcon id={entry.pluginId} name={entry.name} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{entry.name}</div>
          <div className="text-tau-sm text-ink-3 truncate">@{entry.publisher.login}</div>
        </div>
      </div>
      <p className="text-tau-meta text-ink-2 line-clamp-2">{entry.description}</p>
      {entry.categories?.length ? (
        <p className="text-tau-sm text-ink-3 truncate">
          {categoryLabels(entry.categories).join(" · ")}
        </p>
      ) : null}
      <p
        className="text-tau-sm text-ink-3"
        title="同一设备、同一版本、同一 UTC 日计一次；近 7 日含今日，不代表安装人数"
      >
        {typeof entry.downloadsTotal === "number"
          ? `累计 ${entry.downloadsTotal.toLocaleString()} 次 · 近 7 日 ${entry.downloads7d.toLocaleString()} 次`
          : "下载统计暂不可用"}
      </p>
      <div className="text-tau-sm text-ink-3 mt-auto flex items-center gap-2">
        <span className="tabular-nums">{entry.latest.version}</span>
        <span className="ml-auto" onClick={event => event.stopPropagation()}>
          <InstallButton
            name={entry.name}
            state={installState(entry, installed, pending)}
            onCancel={undefined}
          />
        </span>
      </div>
    </article>
  );
}

function Installed({
  runtime,
  installed,
  query,
  onOpen,
}: {
  runtime: DesktopPluginRuntime;
  installed: InstalledPlugin[];
  query: string;
  onOpen: (id: string) => void;
}) {
  const shown = installed.filter(item => matchesQuery([item.info.id, item.info.name], query));
  const attention = shown.filter(needsAttention);
  const development = shown.filter(item => item.source === "development" && !needsAttention(item));
  const normal = shown.filter(item => item.source !== "development" && !needsAttention(item));
  const issues = runtime.local?.issues ?? [];
  return (
    <>
      {(attention.length > 0 || issues.length > 0) && (
        <Group title="需要处理" hint="出问题的插件不会影响其他插件">
          {attention.map(item => (
            <InstalledRow key={item.info.id} runtime={runtime} plugin={item} onOpen={onOpen} />
          ))}
          {issues.map(issue => (
            <div key={issue.id} className="flex min-h-[56px] items-center gap-3.5 px-3 py-2.5">
              <PluginIcon id={issue.id} name={issue.id} size="sm" />
              <div className="min-w-0 flex-1">
                <b className="text-[13.5px] font-medium">{issue.id}</b>
                <p role="alert" className="text-tau-meta text-danger truncate">
                  {issue.error}
                </p>
              </div>
            </div>
          ))}
        </Group>
      )}
      <Group title="已安装" hint="启用状态在所有工作区保持一致">
        {normal.length === 0 ? (
          <p className="text-tau-meta text-ink-2 px-3 py-4">
            {query ? "没有匹配的插件" : "当前没有可管理的插件"}
          </p>
        ) : (
          normal.map(item => (
            <InstalledRow key={item.info.id} runtime={runtime} plugin={item} onOpen={onOpen} />
          ))
        )}
      </Group>
      {development.length > 0 && (
        <Group title="开发中" hint="登记的构建目录，可监听自动重载">
          {development.map(item => (
            <InstalledRow key={item.info.id} runtime={runtime} plugin={item} onOpen={onOpen} />
          ))}
        </Group>
      )}
      {runtime.local && (
        <p className="text-tau-meta text-ink-2 flex items-center gap-2 px-1">
          <FolderOpen className="text-ink-3 size-4" strokeWidth={1.75} />
          插件目录 <span className="font-tau-mono text-[12px]">{runtime.local.directory}</span>
          <span className="text-ink-3">· 新安装的插件默认停用，请手动启用</span>
        </p>
      )}
    </>
  );
}

export function InstalledRow({
  runtime,
  plugin,
  onOpen,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
  onOpen: (id: string) => void;
}) {
  const control = usePluginControl(runtime, plugin);
  const [uninstalling, setUninstalling] = useState(false);
  const { info } = plugin;
  const error =
    plugin.info.state === "restart-required"
      ? plugin.error
      : control.error || plugin.error || plugin.update?.error;
  return (
    <>
      <div
        onClick={() => onOpen(info.id)}
        className={cn(
          "hover:bg-hover flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5",
          !plugin.enabled && "[&_.plugin-name]:opacity-60"
        )}
      >
        <PluginIcon id={info.id} name={info.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" className="plugin-name text-[13.5px] font-medium">
              {info.name}
            </button>
            <span className="text-tau-sm text-ink-3 tabular-nums">{info.version}</span>
            <SourceChip source={plugin.source} />
          </div>
          {error ? (
            <p role="alert" className="text-tau-meta text-danger truncate">
              {error}
            </p>
          ) : (
            <p className="text-tau-meta text-ink-2 truncate">{STATE_LABELS[info.state]}</p>
          )}
        </div>
        <div
          className="flex flex-none items-center gap-2"
          onClick={event => event.stopPropagation()}
        >
          {plugin.update?.pendingVersion && <StagedChip version={plugin.update.pendingVersion} />}
          <Switch
            size="sm"
            aria-label={`${plugin.enabled ? "停用" : "启用"} ${info.name}`}
            checked={plugin.enabled}
            disabled={!control.canToggle}
            onCheckedChange={() => void control.toggle()}
          />
          <PluginMenu
            runtime={runtime}
            plugin={plugin}
            control={control}
            onDetail={() => onOpen(info.id)}
            onUninstall={() => setUninstalling(true)}
          />
        </div>
      </div>
      <UninstallDialog
        name={info.name}
        open={uninstalling}
        onOpenChange={setUninstalling}
        onConfirm={control.uninstall}
      />
    </>
  );
}

/** 行与详情页共用的 ⋯ 菜单：按来源裁剪，内置插件不可卸载。 */
export function PluginMenu({
  runtime,
  plugin,
  control,
  onDetail,
  onUninstall,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
  control: ReturnType<typeof usePluginControl>;
  onDetail?: () => void;
  onUninstall: () => void;
}) {
  const local = runtime.local?.owns(plugin.info.id);
  const update = plugin.update;
  return (
    <MoreButton label={`${plugin.info.name} 的更多操作`}>
      {onDetail && <Menu.Item onSelect={onDetail}>查看详情</Menu.Item>}
      {update?.pending && (
        <Menu.Item onSelect={() => void control.cancelUpdate()}>取消待更新</Menu.Item>
      )}
      {update?.previousVersion && (
        <Menu.Item
          disabled={update.pending || update.blocked}
          onSelect={() => void control.restorePrevious()}
        >
          恢复上一版 {update.previousVersion}
        </Menu.Item>
      )}
      {plugin.source === "development" && (
        <>
          <Menu.Item onSelect={() => void control.toggleWatch()}>
            {control.watching ? "停止监听" : "监听构建"}
          </Menu.Item>
          <Menu.Item onSelect={() => void control.reload()}>重载构建</Menu.Item>
          <Menu.Item onSelect={() => void control.removeRegistration()}>移除登记</Menu.Item>
        </>
      )}
      {local && (
        <>
          <Menu.Separator />
          <Menu.Item danger onSelect={onUninstall}>
            卸载…
          </Menu.Item>
        </>
      )}
    </MoreButton>
  );
}

function Updates({
  installed,
  entries,
  catalogError,
  onOpen,
}: {
  installed: InstalledPlugin[];
  entries: PluginCatalogEntry[];
  catalogError: string;
  onOpen: (id: string) => void;
}) {
  if (!entries.length)
    return (
      <Empty icon={<RefreshCw />} title={catalogError ? "暂时无法检查更新" : "所有插件都是最新的"}>
        <p>{catalogError || "只检查从插件中心安装的插件；本地 ZIP 安装的插件不在线检查。"}</p>
      </Empty>
    );
  return (
    <Group title="可更新" hint="更新在下次完整启动时切换，失败会保留旧版">
      {entries.map(entry => {
        const plugin = installed.find(item => item.info.id === entry.pluginId);
        if (!plugin) return null;
        return (
          <div
            key={entry.pluginId}
            onClick={() => onOpen(entry.pluginId)}
            className="hover:bg-hover flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5"
          >
            <PluginIcon id={entry.pluginId} name={entry.name} size="sm" />
            <div className="min-w-0 flex-1">
              <b className="text-[13.5px] font-medium">{entry.name}</b>
              <span className="text-tau-sm text-ink-3 ml-2 tabular-nums">
                {plugin.info.version} → {entry.compatible?.version}
              </span>
            </div>
            <span onClick={event => event.stopPropagation()}>
              <InstallButton name={entry.name} state={installState(entry, plugin, plugin.update)} />
            </span>
          </div>
        );
      })}
    </Group>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13.5px] font-semibold">
        {title}
        {hint && <small className="text-tau-sm text-ink-3 font-normal">{hint}</small>}
      </h2>
      <div className="border-line-1 rounded-[var(--tau-radius-lg)] border p-1">{children}</div>
    </section>
  );
}

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="text-tau-meta text-ink-2 flex flex-col items-center gap-1.5 px-5 py-16 text-center [&>span>svg]:size-6">
      <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        {icon}
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">{title}</p>
      {children}
    </div>
  );
}
