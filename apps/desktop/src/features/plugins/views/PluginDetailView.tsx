import { useMemo, useState, type ReactNode } from "react";
import { produce } from "immer";
import { copyJson } from "@tau/plugins/host";
import type { JsonValue } from "@tau/plugins";
import { ArrowLeft, ExternalLink, Github, Layers, ShieldAlert } from "lucide-react";
import { Button, FadeScroll, Switch, Tabs } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { useDesktopPluginError, useDesktopPlugins } from "@/app/plugins/context";
import {
  PLUGIN_DETAIL_KEY,
  type DesktopPluginRuntime,
  type PluginSettingsKey,
} from "@/app/plugins/runtime";
import { openExternal } from "@/commands/extra";
import { savePluginVideoConfig } from "@/commands/plugin-video";
import useSettingStore from "@/stores/useSettingStore";
import { useSettingsStore } from "@/app/settingsStore";
import type { PluginCatalogEntry, PluginRelease } from "@/types/plugin-center";
import { formatSize, pluginPortalUrl } from "@tau/plugins/center";
import {
  CONTRIBUTION_LABELS,
  STATE_LABELS,
  STATIC_PACKAGE_LABELS,
  installState,
  installedPlugins,
  pendingCount,
  versionRows,
  type InstalledPlugin,
  type VersionRowModel,
} from "../model";
import { usePluginCatalog, usePluginRelease, usePluginVersions } from "../queries";
import { usePluginControl } from "../usePluginControl";
import { PluginIcon } from "../components/PluginIcon";
import { CategoryTag } from "../components/CategoryTag";
import { PluginMarkdown } from "../components/PluginMarkdown";
import {
  InstallButton,
  RestartBar,
  SourceChip,
  StagedChip,
  UninstallDialog,
} from "../components/PluginParts";
import { PluginSettingsView } from "./PluginSettingsView";
import { PluginAISettings } from "../components/PluginAISettings";
import { PluginMenu } from "./PluginsView";
import { PluginCommunityTab } from "../components/PluginCommunityTab";
import { PluginPermissionsTab } from "../permissions/PluginPermissionsTab";
import { PluginBackendPanel } from "../components/PluginBackendPanel";

type DetailTab =
  | "readme"
  | "settings"
  | "permissions"
  | "backend"
  | "changelog"
  | "versions"
  | "community";
export type PluginDetailParams = {
  pluginId: string;
  tab?: string;
  section?: string;
  /** 从哪个设置分区跳来：设置页显示返回条 */
  from?: string;
};

export function PluginDetailView() {
  const runtime = useDesktopPlugins();
  const startupError = useDesktopPluginError();
  const { navigator } = usePage();
  const params = usePageParams<PluginDetailParams>();
  const catalog = usePluginCatalog();
  const entry = catalog.data?.items.find(item => item.pluginId === params.pluginId);
  const installed = runtime
    ? installedPlugins(runtime).find(item => item.info.id === params.pluginId)
    : undefined;
  const release = usePluginRelease(installed?.releaseId ?? entry?.latest.releaseId);

  if (!runtime)
    return (
      <Paper>
        <p role={startupError ? "alert" : undefined} className="text-tau-body text-ink-2">
          {startupError || "正在准备插件管理…"}
        </p>
      </Paper>
    );
  if (!installed && !entry)
    return (
      <Paper>
        <p className="text-tau-body text-ink-2 mb-3">
          {catalog.loading ? "正在读取插件资料…" : "此插件已不可用。"}
        </p>
        {!catalog.loading && (
          <Button onClick={() => navigator.push("plugins", { tab: "installed" })}>
            返回插件列表
          </Button>
        )}
      </Paper>
    );

  const setTab = (tab: DetailTab, section?: string) =>
    navigator.push(PLUGIN_DETAIL_KEY, {
      pluginId: params.pluginId,
      tab,
      section,
      ...(tab === "settings" && params.from ? { from: params.from } : {}),
    });
  const changelog = release.data?.content.changelog;
  const tabs: { key: DetailTab; label: string; children: ReactNode }[] = [
    {
      key: "readme",
      label: "介绍",
      children: release.data ? (
        <PluginMarkdown source={release.data.content.readme} />
      ) : (
        <p className="text-tau-body text-ink-2">
          {release.isPending && (installed?.releaseId || entry)
            ? "正在读取说明…"
            : release.error
              ? "暂时读取不到插件说明。"
              : "此插件没有提供说明。"}
        </p>
      ),
    },
  ];
  if (installed)
    tabs.push({
      key: "settings",
      label: "设置",
      children: (
        <SettingsTab
          runtime={runtime}
          plugin={installed}
          section={params.section}
          from={params.from}
          onSection={key => setTab("settings", key)}
        />
      ),
    });
  if (installed?.info.permissions?.length)
    tabs.push({
      key: "permissions",
      label: "权限",
      children: (
        <PluginPermissionsTab
          broker={runtime.permissions}
          data={runtime.data}
          pluginId={installed.info.id}
          permissions={installed.info.permissions}
          active={installed.info.state === "active"}
        />
      ),
    });
  if (installed?.info.backend)
    tabs.push({
      key: "backend",
      label: "本机后台",
      children: <PluginBackendPanel pluginId={installed.info.id} />,
    });
  if (changelog)
    tabs.push({
      key: "changelog",
      label: "更新日志",
      children: <PluginMarkdown source={changelog} />,
    });
  tabs.push({
    key: "versions",
    label: "版本",
    children: (
      <VersionsTab runtime={runtime} pluginId={params.pluginId} plugin={installed} entry={entry} />
    ),
  });
  if (entry)
    tabs.push({
      key: "community",
      label: "评论与喜欢",
      children: <PluginCommunityTab key={params.pluginId} pluginId={params.pluginId} />,
    });
  const tab = tabs.find(item => item.key === params.tab)?.key ?? "readme";

  return (
    <Paper>
      <div className="mb-4 empty:hidden">
        <RestartBar count={pendingCount(runtime)} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] grid-rows-[minmax(0,1fr)] gap-10">
        <div className="flex min-h-0 min-w-0 flex-col">
          <Header runtime={runtime} id={params.pluginId} plugin={installed} entry={entry} />
          <Tabs<DetailTab>
            className="mt-5 min-h-0 flex-1"
            panelClassName="flex min-h-0 flex-1 flex-col"
            activeKey={tab}
            onChange={key => setTab(key)}
            items={tabs.map(item => ({
              ...item,
              children: (
                <FadeScroll key={item.key} className="-mx-1 min-h-0 flex-1 px-1">
                  {item.children}
                </FadeScroll>
              ),
            }))}
          />
        </div>
        <FadeScroll className="min-h-0">
          <Aside
            runtime={runtime}
            id={params.pluginId}
            plugin={installed}
            entry={entry}
            release={release.data}
          />
        </FadeScroll>
      </div>
    </Paper>
  );
}

function Paper({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col pt-6 pr-[30px] pb-6 pl-9">{children}</div>
      </div>
    </div>
  );
}

function Header({
  runtime,
  id,
  plugin,
  entry,
}: {
  runtime: DesktopPluginRuntime;
  id: string;
  plugin?: InstalledPlugin;
  entry?: PluginCatalogEntry;
}) {
  const name = plugin?.info.name ?? entry?.name ?? id;
  return (
    <>
      <div className="flex items-center gap-[18px]">
        <PluginIcon id={id} name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-[1.3] font-semibold">{name}</h1>
          <div className="text-tau-meta text-ink-2 mt-1 flex flex-wrap items-center gap-2">
            {entry && <span>@{entry.publisher.login}</span>}
            <span className="tabular-nums">{plugin?.info.version ?? entry?.latest.version}</span>
            {plugin && <SourceChip source={plugin.source} />}
            {plugin && (
              <span>
                {plugin.packageKind
                  ? STATIC_PACKAGE_LABELS[plugin.packageKind].state
                  : STATE_LABELS[plugin.info.state]}
              </span>
            )}
          </div>
        </div>
        {plugin ? (
          <InstalledActions runtime={runtime} plugin={plugin} entry={entry} />
        ) : (
          entry && (
            <InstallButton
              name={entry.name}
              state={installState(
                entry,
                undefined,
                runtime.local?.updates.find(u => u.id === id)
              )}
            />
          )
        )}
      </div>
      {entry && <p className="text-tau-body text-ink-2 mt-3 max-w-[70ch]">{entry.description}</p>}
    </>
  );
}

function InstalledActions({
  runtime,
  plugin,
  entry,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
  entry?: PluginCatalogEntry;
}) {
  const control = usePluginControl(runtime, plugin);
  const [uninstalling, setUninstalling] = useState(false);
  const { navigator } = usePage();
  const state = entry ? installState(entry, plugin, plugin.update) : undefined;
  const error =
    plugin.info.state === "restart-required"
      ? plugin.error
      : control.error || plugin.error || plugin.update?.error;
  return (
    <div className="flex flex-none flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {plugin.update?.pendingVersion ? (
          <StagedChip version={plugin.update.pendingVersion} />
        ) : (
          state?.kind === "update" && <InstallButton name={plugin.info.name} state={state} />
        )}
        {plugin.packageKind ? (
          <span className="text-tau-meta text-ink-2">
            {STATIC_PACKAGE_LABELS[plugin.packageKind].kind}
          </span>
        ) : (
          <Switch
            aria-label={`${plugin.enabled ? "停用" : "启用"} ${plugin.info.name}`}
            checked={plugin.enabled}
            disabled={!control.canToggle}
            onCheckedChange={() => void control.toggle()}
          />
        )}
        <PluginMenu
          runtime={runtime}
          plugin={plugin}
          control={control}
          onUninstall={() => setUninstalling(true)}
        />
      </div>
      {error && (
        <p role="alert" className="text-tau-meta text-danger max-w-[320px] text-right">
          {error}
        </p>
      )}
      <UninstallDialog
        name={plugin.info.name}
        open={uninstalling}
        onOpenChange={setUninstalling}
        onConfirm={async purge => {
          await control.uninstall(purge);
          navigator.push("plugins", { tab: "installed" });
        }}
      />
    </div>
  );
}

/** 插件声明的设置：只在启用时挂载，按分组切换，停用后保留已保存的值。 */
function SettingsTab({
  runtime,
  plugin,
  section,
  from,
  onSection,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
  section?: string;
  from?: string;
  onSection: (key: PluginSettingsKey) => void;
}) {
  const sections = runtime
    .listSettings()
    .filter(item => item.context.pluginId === plugin.info.id && item.definition.target !== "asr");
  const active = section ? sections.find(item => item.key === section) : sections[0];

  // 为视频插件提供 videoConfig - Hooks 必须在所有条件语句之前调用
  const pluginId = plugin.info.id;
  const stored = useSettingStore(state => state.setting.onlineVideo.configurations[pluginId]);
  const videoConfigValue = useMemo(() => copyJson((stored ?? {}) as JsonValue), [stored]);

  if (plugin.info.state !== "active")
    return (
      <p className="text-tau-body text-ink-2">
        插件设置暂不可用。启用后可恢复设置，已保存的偏好仍然保留。
      </p>
    );

  const videoConfig =
    active?.definition.target === "video"
      ? {
          value: videoConfigValue,
          save: async (value: JsonValue) => {
            await savePluginVideoConfig(pluginId, value);
            useSettingStore.setState(state => ({
              setting: produce(state.setting, draft => {
                draft.onlineVideo.configurations[pluginId] = value;
              }),
            }));
          },
        }
      : undefined;

  const returnTo = from === "sync" || from === "imageBed" ? from : undefined;
  return (
    <div className="min-w-0">
      {returnTo && (
        <div className="bg-accent-soft text-accent-text text-tau-meta mb-5 flex items-center gap-2 rounded-[12px] px-3 py-2">
          <ArrowLeft size={14} className="flex-none" />
          <span className="min-w-0 flex-1">
            从「设置 › {returnTo === "sync" ? "同步" : "资源存储"}」进入，保存后可回去继续
          </span>
          <Button size="sm" onClick={() => useSettingsStore.getState().openSettings(returnTo)}>
            返回{returnTo === "sync" ? "同步" : "资源存储"}设置
          </Button>
        </div>
      )}
      <PluginAISettings pluginId={plugin.info.id} />
      {sections.length > 1 && (
        <nav aria-label="插件设置分组" className="mb-4 flex flex-wrap gap-2">
          {sections.map(item => (
            <Button
              key={item.key}
              size="sm"
              variant={item === active ? "soft" : "ghost"}
              aria-current={item === active ? "page" : undefined}
              onClick={() => onSection(item.key)}
            >
              {item.definition.title}
            </Button>
          ))}
        </nav>
      )}
      {active ? (
        <section aria-label={active.definition.title}>
          <h3 className="text-tau-body text-ink-1 mb-1 font-semibold">{active.definition.title}</h3>
          {active.definition.description && (
            <p className="text-tau-meta text-ink-2 mb-4">{active.definition.description}</p>
          )}
          <PluginSettingsView section={active} videoConfig={videoConfig} />
        </section>
      ) : section ? (
        <PluginSettingsView />
      ) : (
        <p className="text-tau-body text-ink-2">此插件没有自定义设置。</p>
      )}
    </div>
  );
}

function VersionsTab({
  runtime,
  pluginId,
  plugin,
  entry,
}: {
  runtime: DesktopPluginRuntime;
  pluginId: string;
  plugin?: InstalledPlugin;
  entry?: PluginCatalogEntry;
}) {
  const versions = usePluginVersions(pluginId, Boolean(entry));
  const rows = versionRows(plugin, versions.data, entry);
  return (
    <div className="min-w-0">
      {rows.map(row => (
        <VersionRow key={row.version} version={row.version} note={row.notes.join(" · ")}>
          {row.action && plugin && (
            <VersionAction runtime={runtime} plugin={plugin} action={row.action} />
          )}
        </VersionRow>
      ))}
      {entry && versions.isPending && (
        <p className="text-tau-sm text-ink-3 mt-3">正在读取历史版本…</p>
      )}
      {versions.error && (
        <p className="text-tau-sm text-ink-3 mt-3">暂时读取不到历史版本，仅显示最新版。</p>
      )}
      <p className="text-tau-sm text-ink-3 mt-3">切换版本只替换插件代码，不回退已保存的数据。</p>
    </div>
  );
}

function VersionAction({
  runtime,
  plugin,
  action,
}: {
  runtime: DesktopPluginRuntime;
  plugin: InstalledPlugin;
  action: NonNullable<VersionRowModel["action"]>;
}) {
  const control = usePluginControl(runtime, plugin);
  const update = plugin.update;
  return (
    <>
      {control.error && (
        <span role="alert" className="text-tau-meta text-danger">
          {control.error}
        </span>
      )}
      {action === "cancel-update" ? (
        <Button variant="ghost" size="sm" onClick={() => void control.cancelUpdate()}>
          取消
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={update?.pending || update?.blocked}
          onClick={() => void control.restorePrevious()}
        >
          恢复此版本
        </Button>
      )}
    </>
  );
}

function VersionRow({
  version,
  note,
  children,
}: {
  version: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-3 shadow-[0_1px_0_var(--tau-line-2)]">
      <b className="w-20 text-[13.5px] font-semibold tabular-nums">{version}</b>
      <span className="text-tau-meta text-ink-2 flex-1">{note}</span>
      {children}
    </div>
  );
}

function Aside({
  runtime,
  id,
  plugin,
  entry,
  release,
}: {
  runtime: DesktopPluginRuntime;
  id: string;
  plugin?: InstalledPlugin;
  entry?: PluginCatalogEntry;
  release?: PluginRelease;
}) {
  const active = plugin?.info.state === "active";
  const registered = active ? runtime.host.listContributions(id) : {};
  const contributions = Object.entries(CONTRIBUTION_LABELS).flatMap(([kind, label]) => {
    const count = registered[kind as keyof typeof registered] ?? 0;
    return count > 0 ? [{ label, count }] : [];
  });
  const info: [string, ReactNode][] = [
    ["插件 ID", <span className="font-tau-mono text-[12px]">{id}</span>],
  ];
  if (plugin) info.push(["当前版本", plugin.info.version]);
  if (entry?.categories?.length)
    info.push([
      "分类",
      <span className="flex flex-wrap gap-1.5">
        {entry.categories.map(category => (
          <CategoryTag key={category} category={category} />
        ))}
      </span>,
    ]);
  if (entry) {
    info.push(["需要客户端", `≥ ${(entry.compatible ?? entry.latest).minAppVersion}`]);
    info.push(["大小", formatSize((entry.compatible ?? entry.latest).size)]);
    info.push(["发布于", new Date(entry.latest.publishedAt).toLocaleDateString()]);
  }
  if (entry) {
    const portalUrl = pluginPortalUrl(id);
    info.push([
      "详情页",
      <button
        type="button"
        className="text-accent-text inline-flex max-w-full items-center gap-1"
        onClick={() => void openExternal(portalUrl)}
      >
        <ExternalLink className="size-3.5 flex-none" strokeWidth={1.75} />
        <span className="truncate">{portalUrl.replace(/^https:\/\//, "")}</span>
      </button>,
    ]);
  }
  if (release?.repository)
    info.push([
      "源码",
      <button
        type="button"
        className="text-accent-text inline-flex items-center gap-1 truncate"
        onClick={() => void openExternal(release.repository)}
      >
        <Github className="size-3.5 flex-none" strokeWidth={1.75} />
        <span className="truncate">
          {release.repository.replace(/^https:\/\/github\.com\//, "")}
        </span>
      </button>,
    ]);
  if (release)
    info.push([
      "SHA-256",
      <span className="font-tau-mono text-[12px]">{release.sha256.slice(0, 12)}…</span>,
    ]);
  return (
    <aside className="flex flex-col gap-6 pt-1">
      <div>
        <h4 className="text-tau-sm text-ink-3 mb-2 font-medium">信息</h4>
        <dl className="text-tau-meta grid grid-cols-[84px_minmax(0,1fr)] gap-y-2">
          {info.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-2">{label}</dt>
              <dd className="min-w-0 truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {plugin && (
        <div>
          <h4 className="text-tau-sm text-ink-3 mb-2 font-medium">此插件提供</h4>
          {contributions.length ? (
            <ul className="text-tau-meta flex flex-col gap-1.5">
              {contributions.map(({ count, label }) => (
                <li key={label} className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  <span className="text-ink-3 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-tau-meta text-ink-3 flex items-center gap-2">
              <Layers className="size-3.5" strokeWidth={1.75} />
              {plugin.packageKind === "template"
                ? "博客模板，在发布设置中选择使用"
                : plugin.packageKind === "skills"
                  ? "Skill 包，安装后在 Skill 页使用"
                  : active
                    ? "没有登记可展示的功能"
                    : "启用后可见"}
            </p>
          )}
        </div>
      )}
      <div className="bg-warn-soft text-tau-sm text-ink-2 flex gap-2.5 rounded-[var(--tau-radius-md)] p-3 leading-[1.6]">
        <ShieldAlert className="text-warn mt-0.5 size-4 flex-none" strokeWidth={1.75} />
        <span>
          插件在完整应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。
        </span>
      </div>
    </aside>
  );
}
