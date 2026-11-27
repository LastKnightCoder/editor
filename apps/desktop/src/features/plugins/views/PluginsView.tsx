import { categoryLabel, installedPluginError } from "../display";
import { STATE_LABELS, STATIC_PACKAGE_LABELS } from "../display";
import {
  pluginTranslator,
  pluginNumber,
  pluginCount,
  usePluginI18n,
} from "@/features/plugins/i18n";
import {
  PLUGIN_DEVELOPER_DOCS_URL,
  PLUGIN_PORTAL_URL,
  pluginSearchTerms,
  resolvePluginMetadata,
} from "@tau/plugins/center";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowUpCircle,
  BookOpen,
  ChevronDown,
  CloudOff,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  LayoutGrid,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  SearchX,
} from "lucide-react";
import { Button, FadeScroll, Input, Loading, Menu, Select, Switch, Tabs, cn } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { openExternal } from "@/commands/extra";
import { openPluginDirectory, stagePluginZip } from "@/commands/plugin-local";
import type { PluginCategory } from "@tau/plugins/package";
import type { PluginCatalogEntry, PluginCatalogSort } from "@/types/plugin-center";
import {
  availableUpdates,
  catalogCategories,
  pendingCount,
  installState,
  installedPlugins,
  matchesQuery,
  needsAttention,
  saveSkipInstallNotice,
  uninstalledPluginData,
  useSkipInstallNotice,
  type InstalledPlugin,
} from "../model";
import {
  useInstallRelease,
  useInstallingReleases,
  usePluginCatalog,
  useRetainedPluginData,
} from "../queries";
import { usePluginControl } from "../usePluginControl";
import { PluginIcon } from "../components/PluginIcon";
import { CategoryTags } from "../components/CategoryTag";
import { RetainedPluginDataSection } from "../components/RetainedPluginDataSection";
import type { RetainedPluginData } from "@/types/plugin-retained-data";
import {
  InstallButton,
  MoreButton,
  RestartBar,
  SourceChip,
  StagedChip,
  UninstallDialog,
} from "../components/PluginParts";
const t = pluginTranslator.t;

type PluginsTab = "discover" | "installed" | "updates";
const TABS: readonly PluginsTab[] = ["discover", "installed", "updates"];

export function PluginsView() {
  usePluginI18n();
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const { navigator } = usePage();
  const params = usePageParams<{ tab?: string }>();
  const tab = TABS.find(item => item === params.tab) ?? "discover";
  const [query, setQuery] = useState("");
  const [actionFailure, setActionFailure] = useState<{ cause: unknown } | null>(null);
  const actionError = actionFailure
    ? actionFailure.cause instanceof Error
      ? actionFailure.cause.message
      : t("common.actionFailed")
    : "";
  const [sort, setSort] = useState<PluginCatalogSort>("downloads7d");
  const [category, setCategory] = useState<PluginCategory | null>(null);
  const skipInstallNotice = useSkipInstallNotice();
  const catalog = usePluginCatalog("", tab === "discover" ? sort : "updated");
  const retainedQuery = useRetainedPluginData(runtime);
  const installed = runtime ? installedPlugins(runtime) : [];
  const retained = runtime ? uninstalledPluginData(runtime, retainedQuery.data) : [];
  const [retainedOpen, setRetainedOpen] = useState(false);
  const [retainedHighlighted, setRetainedHighlighted] = useState(false);
  const retainedRef = useRef<HTMLElement | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const pendingScrollRetained = useRef(false);
  const workspaceKey = runtime?.workspaceId;
  const previousWorkspace = useRef(workspaceKey);

  useEffect(() => {
    if (previousWorkspace.current !== workspaceKey) {
      previousWorkspace.current = workspaceKey;
      setRetainedOpen(false);
      setRetainedHighlighted(false);
    }
  }, [workspaceKey]);

  useEffect(() => {
    if (tab !== "installed" || !pendingScrollRetained.current) return;
    pendingScrollRetained.current = false;
    const frame = window.requestAnimationFrame(() => {
      retainedRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, retainedOpen]);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  const openRetainedData = () => {
    setRetainedOpen(true);
    setRetainedHighlighted(true);
    pendingScrollRetained.current = true;
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setRetainedHighlighted(false), 1300);
    if (tab !== "installed") {
      navigator.push("plugins", { tab: "installed" });
    } else {
      window.requestAnimationFrame(() => {
        pendingScrollRetained.current = false;
        retainedRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const updates = (catalog.data?.items ?? []).flatMap(entry => {
    const plugin = installed.find(item => item.info.id === entry.pluginId);
    const state = installState(entry, plugin, plugin?.update);
    return plugin && (state.kind === "update" || state.kind === "staged") ? [entry] : [];
  });
  const openDetail = (pluginId: string) => navigator.push("plugin-detail", { pluginId });
  const run = (action: () => Promise<unknown>) => {
    setActionFailure(null);
    void Promise.resolve()
      .then(action)
      .catch(cause => setActionFailure({ cause }));
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">
              {t("center.title")}
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate">
              {t("center.subtitle")}
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
                aria-label={t("center.sort")}
                disabled={!catalog.data?.windowStart}
                value={catalog.data?.windowStart ? sort : "updated"}
                onValueChange={value => setSort(value as PluginCatalogSort)}
                options={[
                  { value: "downloads7d", label: t("center.popular") },
                  { value: "downloadsTotal", label: t("center.downloads") },
                  { value: "updated", label: t("center.updated") },
                ]}
              />
            )}
            <Input
              size="sm"
              lead={Search}
              clearable
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t("center.search")}
              className="w-0"
              wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
            />
            <MoreButton label={t("center.more")}>
              {runtime?.canManageRetainedData && (
                <>
                  <Menu.Item icon={<Database strokeWidth={1.75} />} onSelect={openRetainedData}>
                    {t("retained.title")}
                    {retained.length > 0 && (
                      <span className="text-ink-3 ml-auto pl-4 tabular-nums">
                        {retained.length}
                      </span>
                    )}
                  </Menu.Item>
                  <Menu.Separator />
                </>
              )}
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
                      {t("center.zip")}
                    </Menu.Item>
                  )}
                  <Menu.Item
                    icon={<FolderOpen strokeWidth={1.75} />}
                    onSelect={() => run(openPluginDirectory)}
                  >
                    {t("center.directory")}
                  </Menu.Item>
                  <Menu.Item
                    icon={<RefreshCw strokeWidth={1.75} />}
                    onSelect={() => run(async () => runtime.local?.refresh())}
                  >
                    {t("center.rescan")}
                  </Menu.Item>
                  <Menu.Separator />
                </>
              )}
              <Menu.CheckboxItem
                icon={<ShieldAlert strokeWidth={1.75} />}
                checked={!skipInstallNotice}
                onCheckedChange={checked => saveSkipInstallNotice(!checked)}
              >
                {t("center.risk")}
              </Menu.CheckboxItem>
              <Menu.Separator />
              <Menu.Item
                icon={<BookOpen strokeWidth={1.75} />}
                onSelect={() => void openExternal(PLUGIN_DEVELOPER_DOCS_URL)}
              >
                {t("center.docs")}
              </Menu.Item>
              <Menu.Item
                icon={<ExternalLink strokeWidth={1.75} />}
                onSelect={() => void openExternal(PLUGIN_PORTAL_URL)}
              >
                {t("center.portal")}
              </Menu.Item>
            </MoreButton>
          </div>
          <Tabs<PluginsTab>
            className="mt-3"
            activeKey={tab}
            onChange={key => navigator.push("plugins", { tab: key })}
            items={[
              { key: "discover", label: t("center.discover"), children: null },
              {
                key: "installed",
                label: pluginCount("center.installedCount", installed.length),
                children: null,
              },
              {
                key: "updates",
                label: updates.length
                  ? pluginCount("center.updateCount", updates.length)
                  : t("common.update"),
                children: null,
              },
            ]}
          />
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pt-4 pr-[26px] pb-2 pl-8">
          <div className="mb-4 flex flex-col gap-2 empty:hidden">
            <RestartBar count={pendingCount(runtime)} />
            {tab === "discover" && catalog.data && catalog.error && (
              <p role="alert" className="text-tau-meta text-danger">
                {t("center.stale")}
                {catalog.error}
              </p>
            )}
            {(actionError || startupError || runtime?.local?.scanError) && (
              <p role="alert" className="text-tau-meta text-danger">
                {actionError || startupError || runtime?.local?.scanError}
              </p>
            )}
          </div>
          {!runtime ? (
            <p className="text-tau-body text-ink-2">{startupError ? "" : t("center.preparing")}</p>
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
            <Installed
              runtime={runtime}
              installed={installed}
              retained={retained}
              retainedLoading={retainedQuery.loading}
              retainedError={retainedQuery.error}
              onRetryRetained={retainedQuery.refresh}
              retainedOpen={retainedOpen}
              onRetainedOpenChange={setRetainedOpen}
              retainedHighlighted={retainedHighlighted}
              retainedRef={retainedRef}
              catalog={catalog.data?.items ?? []}
              query={query}
              onOpen={openDetail}
            />
          ) : (
            <Updates
              installed={installed}
              entries={updates.filter(entry => matchesQuery(pluginSearchTerms(entry), query))}
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
  usePluginI18n();
  const items = catalogCategories(entries);
  if (!items.length && !value) return null;
  const label = value ? categoryLabel(value) : t("center.allCategories");
  return (
    <Menu
      align="end"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          icon={LayoutGrid}
          aria-label={t("center.category", { category: label })}
        >
          {label}
          <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
        </Button>
      }
    >
      <Menu.RadioGroup
        value={value ?? ""}
        onValueChange={next => onChange((next || null) as PluginCategory | null)}
      >
        <Menu.RadioItem value="">{t("center.allCategories")}</Menu.RadioItem>
        {items.map(item => (
          <Menu.RadioItem key={item.id} value={item.id}>
            {categoryLabel(item.id)}
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
  usePluginI18n();
  if (catalog.loading) return <Loading label={t("center.loading")} />;
  if (!catalog.data)
    return (
      <Empty icon={<CloudOff />} title={t("center.offline")}>
        <p>
          {t("center.keepRunning")}
          {catalog.error}
        </p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={catalog.refresh}>
          {t("common.retry")}
        </Button>
      </Empty>
    );
  const entries = catalog.data.items.filter(
    entry =>
      (!category || entry.categories?.includes(category)) &&
      matchesQuery(pluginSearchTerms(entry), query)
  );
  if (!entries.length && category)
    return (
      <Empty
        icon={<SearchX />}
        title={
          query ? t("center.categoryNoQuery", { query: query.trim() }) : t("center.emptyCategory")
        }
      >
        <Button variant="secondary" size="sm" className="mt-2" onClick={onClearCategory}>
          {t("center.viewAll")}
        </Button>
      </Empty>
    );
  if (!entries.length)
    return (
      <Empty
        icon={<SearchX />}
        title={query ? t("center.noQuery", { query: query.trim() }) : t("center.empty")}
      >
        <p>{t("center.buildOwn")}</p>
        <Button
          variant="ghost"
          size="sm"
          icon={BookOpen}
          className="mt-2"
          onClick={() => void openExternal(PLUGIN_DEVELOPER_DOCS_URL)}
        >
          {t("center.viewDocs")}
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
  const { locale } = usePluginI18n();
  const display = resolvePluginMetadata(entry, locale);
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
        <PluginIcon id={entry.pluginId} name={display.name} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{display.name}</div>
          <div className="text-tau-sm text-ink-3 truncate">@{entry.publisher.login}</div>
        </div>
        {installed && !installed.packageKind && (
          <span className="ml-auto flex-none" onClick={event => event.stopPropagation()}>
            <CardEnableSwitch runtime={runtime} plugin={installed} />
          </span>
        )}
      </div>
      <p className="text-tau-meta text-ink-2 line-clamp-2">{display.description}</p>
      <CategoryTags categories={entry.categories} />
      <div className="text-tau-sm text-ink-3 mt-auto flex items-center gap-2">
        <span className="tabular-nums">{entry.latest.version}</span>
        {typeof entry.downloadsTotal === "number" && (
          <span
            className="flex items-center gap-1 tabular-nums"
            aria-label={pluginCount("center.downloadCount", entry.downloadsTotal)}
            title={t("center.downloadStats", {
              total: pluginNumber(entry.downloadsTotal),
              recent: pluginNumber(entry.downloads7d),
            })}
          >
            <Download className="size-3.5" strokeWidth={1.75} aria-hidden />
            {entry.downloadsTotal.toLocaleString()}
          </span>
        )}
        <span className="ml-auto" onClick={event => event.stopPropagation()}>
          <InstallButton
            name={display.name}
            state={installState(entry, installed, pending)}
            onCancel={undefined}
          />
        </span>
      </div>
    </article>
  );
}

function CardEnableSwitch({
  runtime,
  plugin,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
}) {
  const { locale } = usePluginI18n();
  const displayName = resolvePluginMetadata(plugin.info, locale).name;
  const control = usePluginControl(runtime, plugin);
  return (
    <Switch
      size="sm"
      aria-label={t(plugin.enabled ? "center.disablePlugin" : "center.enablePlugin", {
        name: displayName,
      })}
      title={control.error || undefined}
      checked={plugin.enabled}
      disabled={!control.canToggle}
      onCheckedChange={() => void control.toggle()}
    />
  );
}

function Installed({
  runtime,
  installed,
  retained,
  retainedLoading,
  retainedError,
  onRetryRetained,
  retainedOpen,
  onRetainedOpenChange,
  retainedHighlighted,
  retainedRef,
  catalog,
  query,
  onOpen,
}: {
  runtime: DesktopPluginRuntime;
  installed: InstalledPlugin[];
  retained: readonly RetainedPluginData[];
  retainedLoading: boolean;
  retainedError: string;
  onRetryRetained: () => void;
  retainedOpen: boolean;
  onRetainedOpenChange: (open: boolean) => void;
  retainedHighlighted: boolean;
  retainedRef: RefObject<HTMLElement | null>;
  catalog: readonly PluginCatalogEntry[];
  query: string;
  onOpen: (id: string) => void;
}) {
  usePluginI18n();
  const shown = installed.filter(item =>
    matchesQuery(
      pluginSearchTerms({ id: item.info.id, name: item.info.name, i18n: item.info.i18n }),
      query
    )
  );
  const attention = shown.filter(needsAttention);
  const normal = shown.filter(item => !needsAttention(item));
  const issues = runtime.local?.issues ?? [];
  return (
    <>
      {(attention.length > 0 || issues.length > 0) && (
        <Group title={t("center.attention")} hint={t("center.isolated")}>
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
      <Group title={t("common.installed")} hint={t("center.globalEnabled")}>
        {normal.length === 0 ? (
          <p className="text-tau-meta text-ink-2 px-3 py-4">
            {query ? t("center.noMatch") : t("center.noManaged")}
          </p>
        ) : (
          normal.map(item => (
            <InstalledRow key={item.info.id} runtime={runtime} plugin={item} onOpen={onOpen} />
          ))
        )}
      </Group>
      <RetainedPluginDataSection
        runtime={runtime}
        items={retained}
        catalog={catalog}
        query={query}
        loading={retainedLoading}
        error={retainedError}
        onRetry={onRetryRetained}
        open={retainedOpen}
        onOpenChange={onRetainedOpenChange}
        highlighted={retainedHighlighted}
        onOpenDetail={onOpen}
        sectionRef={retainedRef}
      />
      {runtime.local && (
        <p className="text-tau-meta text-ink-2 flex items-center gap-2 px-1">
          <FolderOpen className="text-ink-3 size-4" strokeWidth={1.75} />
          {t("center.directoryLabel")}
          <span className="font-tau-mono text-[12px]">{runtime.local.directory}</span>
          <span className="text-ink-3">{t("center.localDisabled")}</span>
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
  const { locale } = usePluginI18n();
  const control = usePluginControl(runtime, plugin);
  const [uninstalling, setUninstalling] = useState(false);
  const { info } = plugin;
  const displayName = resolvePluginMetadata(info, locale).name;
  const error =
    plugin.info.state === "restart-required"
      ? installedPluginError(plugin)
      : control.error || installedPluginError(plugin) || plugin.update?.error;
  return (
    <>
      <div
        onClick={() => onOpen(info.id)}
        className={cn(
          "hover:bg-hover flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5",
          !plugin.enabled && "[&_.plugin-name]:opacity-60"
        )}
      >
        <PluginIcon id={info.id} name={displayName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" className="plugin-name text-[13.5px] font-medium">
              {displayName}
            </button>
            <span className="text-tau-sm text-ink-3 tabular-nums">{info.version}</span>
            <SourceChip source={plugin.source} />
          </div>
          {error ? (
            <p role="alert" className="text-tau-meta text-danger truncate">
              {error}
            </p>
          ) : (
            <p className="text-tau-meta text-ink-2 truncate">
              {plugin.packageKind
                ? STATIC_PACKAGE_LABELS[plugin.packageKind].state
                : STATE_LABELS[info.state]}
            </p>
          )}
        </div>
        <div
          className="flex flex-none items-center gap-2"
          onClick={event => event.stopPropagation()}
        >
          {plugin.update?.pendingVersion && <StagedChip version={plugin.update.pendingVersion} />}
          {plugin.packageKind ? (
            <span className="text-tau-meta text-ink-2">
              {STATIC_PACKAGE_LABELS[plugin.packageKind].kind}
            </span>
          ) : (
            <Switch
              size="sm"
              aria-label={t(plugin.enabled ? "center.disablePlugin" : "center.enablePlugin", {
                name: displayName,
              })}
              checked={plugin.enabled}
              disabled={!control.canToggle}
              onCheckedChange={() => void control.toggle()}
            />
          )}
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
        name={displayName}
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
  usePluginI18n();
  const local = runtime.local?.owns(plugin.info.id);
  const update = plugin.update;
  return (
    <MoreButton label={t("center.morePlugin", { name: plugin.info.name })}>
      {onDetail && <Menu.Item onSelect={onDetail}>{t("center.details")}</Menu.Item>}
      {update?.pending && (
        <Menu.Item onSelect={() => void control.cancelUpdate()}>
          {t("center.cancelUpdate")}
        </Menu.Item>
      )}
      {update?.previousVersion && (
        <Menu.Item
          disabled={update.pending || update.blocked}
          onSelect={() => void control.restorePrevious()}
        >
          {t("center.restore")}
          {update.previousVersion}
        </Menu.Item>
      )}
      {local && (
        <>
          <Menu.Separator />
          <Menu.Item danger onSelect={onUninstall}>
            {t("center.uninstall")}
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
  const { locale } = usePluginI18n();
  const install = useInstallRelease(useDesktopPlugins());
  const installing = useInstallingReleases();
  // 已下载待重启的条目与正在下载的版本不再重复发起
  const pending = availableUpdates(entries, installed).filter(id => !installing.includes(id));
  if (!entries.length)
    return (
      <Empty
        icon={<RefreshCw />}
        title={catalogError ? t("center.checkFailed") : t("center.upToDate")}
      >
        <p>{catalogError || t("center.updatesHint")}</p>
      </Empty>
    );
  return (
    <Group
      title={t("center.available")}
      hint={t("center.updateHint")}
      action={
        pending.length > 0 && (
          <Button
            variant="soft"
            size="sm"
            icon={ArrowUpCircle}
            onClick={() => pending.forEach(releaseId => install.mutate(releaseId))}
          >
            {pluginCount("center.updateAllCount", pending.length)}
          </Button>
        )
      }
    >
      {entries.map(entry => {
        const plugin = installed.find(item => item.info.id === entry.pluginId);
        if (!plugin) return null;
        const displayName = resolvePluginMetadata(entry, locale).name;
        return (
          <div
            key={entry.pluginId}
            onClick={() => onOpen(entry.pluginId)}
            className="hover:bg-hover flex min-h-[60px] cursor-pointer items-center gap-3.5 rounded-[10px] px-3 py-2.5"
          >
            <PluginIcon id={entry.pluginId} name={displayName} size="sm" />
            <div className="min-w-0 flex-1">
              <b className="text-[13.5px] font-medium">{displayName}</b>
              <span className="text-tau-sm text-ink-3 ml-2 tabular-nums">
                {plugin.info.version} → {entry.compatible?.version}
              </span>
            </div>
            <span onClick={event => event.stopPropagation()}>
              <InstallButton
                name={displayName}
                state={installState(entry, plugin, plugin.update)}
              />
            </span>
          </div>
        );
      })}
    </Group>
  );
}

function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  usePluginI18n();
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2 text-[13.5px] font-semibold">
          {title}
          {hint && <small className="text-tau-sm text-ink-3 font-normal">{hint}</small>}
        </h2>
        {action}
      </div>
      <div className="border-line-1 rounded-[var(--tau-radius-lg)] border p-1">{children}</div>
    </section>
  );
}

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  usePluginI18n();
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
