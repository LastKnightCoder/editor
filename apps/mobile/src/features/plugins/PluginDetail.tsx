import { PluginOperations } from "./PluginOperations";
import {
  createSettingsDraftController,
  SettingsDraftProvider,
  type SettingsDraftController,
} from "@tau/plugins/settings-draft";
import { PluginPageComponentScope } from "../../app/plugins/component-page-scope";
import { PluginPermissionControls } from "./PluginPermissionControls";
import { MobileProviderSettings } from "./ProviderSettings";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ChevronRight,
  ExternalLink,
  Github,
  Layers,
  MoreHorizontal,
  ShieldAlert,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { comparePluginVersions } from "@tau/plugins/package";
import {
  describeCenterPermissions,
  formatSize,
  pluginPortalUrl,
  type CenterRelease,
} from "@tau/plugins/center";
import { Button, ErrorBoundary, Loading, Switch, cn } from "@tau/ui";
import { useNavigator, usePage } from "../../router";
import { PageHeaderButton } from "../../components/PageHeader";
import { useMobilePlugins, useMobilePluginStatus } from "../../app/plugins/context";
import type { MobilePluginRuntime } from "../../app/plugins/runtime";
import { PluginPageShell } from "./PluginPageView";
import { CenterInstallSheet } from "./CenterInstallSheet";
import { CompatibilityNote } from "./components/CompatibilityNote";
import { DetailTabs } from "./components/DetailTabs";
import { PluginChangesBanner } from "./components/PluginChangesBanner";
import { PluginIcon } from "./components/PluginIcon";
import { PluginManageSheet } from "./components/PluginManageSheet";
import { PluginSettingsCard } from "./components/PluginSettingsCard";
import { SettingsDraftBar, SettingsLeaveSheet } from "./components/SettingsDraftBar";
import { PluginMarkdown } from "./components/PluginMarkdown";
import { ReleaseHistoryList } from "./components/ReleaseHistoryList";
import { StoreActionButton } from "./components/StoreActionButton";
import { TargetSummary } from "./components/TargetSummary";
import { PLATFORM_LABELS, categoryLabel } from "./components/centerDisplay";
import {
  STATUS_DISPLAY,
  TONE_CLASS,
  hasPendingChange,
  lifecycleOf,
} from "./components/pluginStatus";
import { storePrimaryAction, storeTaskPhase } from "./components/storeActions";
import {
  useMobileCenterConfig,
  useMobileCenterInstall,
  useMobileCenterRelease,
  useMobileCenterResolution,
  useMobileCenterVersions,
} from "./data/center-queries";
import { usePluginManager, type ManagedPluginItem } from "./data/usePluginManager";

type DetailTab = "intro" | "settings" | "permissions" | "versions";

const swallow = (action: Promise<unknown>) => void action.catch(() => undefined);
const open = (url: string) => swallow(openUrl(url));

/**
 * 插件详情：商店资料与已安装管理合一。头部回答「是什么、能不能用、在不在运行」，
 * 下方分段标签承载介绍、设置、权限与版本；资料取本平台最高声明版本，安装取选版结果。
 * 未连上插件中心时（开发安装、离线）只展示本机已安装信息。
 */
export function PluginDetail() {
  const { params } = usePage<{ pluginId: string }>();
  const pluginId = params.pluginId;
  const config = useMobileCenterConfig();
  const host = config.data?.host ?? null;
  const versions = useMobileCenterVersions(pluginId, "all");
  const { query: resolution } = useMobileCenterResolution(pluginId);
  const manager = usePluginManager();
  const install = useMobileCenterInstall();
  const runtime = useMobilePlugins();
  const idPrefix = useId();
  const [tab, setActiveTab] = useState<DetailTab>("intro");
  // 设置分区的草稿跟随详情页实例：切 tab、切分组、返回都先问
  const [draft] = useState(() => createSettingsDraftController());
  useEffect(() => () => draft.dispose(), [draft]);
  const setTab = (next: DetailTab) =>
    void draft.confirmLeave().then(leave => leave && setActiveTab(next));
  const [installing, setInstalling] = useState(false);
  const [managing, setManaging] = useState(false);

  const history = [
    ...new Map(
      versions.data?.pages.flatMap(page => page.items).map(item => [item.releaseId, item])
    ).values(),
  ].sort((a, b) => comparePluginVersions(b.version, a.version));
  const latest = (host && history.find(item => item.targets[host.platform])) ?? history[0] ?? null;
  const release = useMobileCenterRelease(latest?.releaseId ?? null);
  const installed = manager.items.find(item => item.id === pluginId) ?? null;
  const compatible = resolution.data?.release ?? null;
  const installationEnabled = !!config.data?.installationEnabled;
  const center = release.data ?? null;

  const failure = config.error ?? versions.error ?? release.error;
  if (
    !installed &&
    (manager.loading || config.isPending || versions.isPending || (latest && release.isPending))
  )
    return (
      <PluginPageShell>
        <Loading minHeight={240} label="正在读取插件…" />
      </PluginPageShell>
    );
  if (!installed && (failure || !latest || !center))
    return (
      <PluginPageShell title="插件详情">
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-ink-1 text-[15px] font-semibold">
            {failure ? "插件资料暂时打不开" : "找不到这个插件"}
          </p>
          <p className="text-ink-2 text-[13px] break-words">
            {failure ? String(failure) : "它可能已下架，或者还没有发布。"}
          </p>
          {failure && (
            <Button
              className="min-h-11"
              onClick={() => void (config.isError ? config.refetch() : versions.refetch())}
            >
              重试
            </Button>
          )}
        </div>
      </PluginPageShell>
    );

  const manifest = center?.content.manifest;
  const name = manifest?.name ?? installed?.name ?? pluginId;
  const primary = storePrimaryAction({
    compatibleVersion: compatible?.version ?? null,
    installed,
    installationEnabled,
  });
  const task = install.task(pluginId);
  const phase = storeTaskPhase(task);
  const permissions =
    installed?.permissions ??
    (manifest && "permissions" in manifest ? (manifest.permissions ?? []) : []);
  const tabs: { key: DetailTab; label: string }[] = [
    { key: "intro", label: "介绍" },
    ...(installed ? [{ key: "settings" as const, label: "设置" }] : []),
    { key: "permissions", label: "权限" },
    { key: "versions", label: "版本" },
  ];
  const activeTab = tabs.some(item => item.key === tab) ? tab : "intro";

  return (
    <PluginPageShell
      actions={
        <>
          <PageHeaderButton
            icon={<ExternalLink size={19} strokeWidth={2.2} />}
            aria-label="在插件门户打开"
            onClick={() => open(pluginPortalUrl(pluginId))}
          />
          {installed && manager.managementEnabled && (
            <PageHeaderButton
              icon={<MoreHorizontal size={22} strokeWidth={2.4} />}
              aria-label="管理插件"
              onClick={() => setManaging(true)}
            />
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-8">
        <Hero
          pluginId={pluginId}
          name={name}
          publisher={center?.publisher.login ?? null}
          version={installed?.version ?? latest?.version ?? null}
          installed={installed}
          phase={phase}
          taskError={task?.error}
          category={manifest?.categories?.[0] ?? null}
        />
        <div className="flex items-center gap-2.5">
          {installed && manager.managementEnabled && (
            <EnableSwitch item={installed} manager={manager} />
          )}
          {(!installed || primary.kind !== "installed" || phase) && (
            <StoreActionButton
              size="lg"
              primary={primary}
              phase={phase}
              onPress={() => setInstalling(true)}
              onCancel={() => swallow(install.cancel(pluginId))}
              onRetry={() => swallow(install.retry(pluginId))}
            />
          )}
        </div>
        {"reason" in primary && primary.reason && (
          <p className="text-ink-3 text-[12px]">{primary.reason}</p>
        )}
        {installed && hasPendingChange(installed) && <PluginChangesBanner changes={[name]} />}
        {installed?.error && (
          <p role="alert" className="text-danger text-[12.5px] break-words">
            {installed.error}
          </p>
        )}
        {latest && center && <Stats release={center} host={host?.platform ?? null} />}
        {host && resolution.isPending ? (
          <p className="text-ink-3 px-1 text-[12px]">正在检查此设备能否安装…</p>
        ) : resolution.data && latest ? (
          <CompatibilityNote
            latestVersion={latest.version}
            compatibleVersion={compatible?.version ?? null}
            compatibility={resolution.data.compatibility}
          />
        ) : resolution.isError ? (
          <p role="alert" className="text-danger text-[12px]">
            兼容检查失败：{String(resolution.error)}
          </p>
        ) : !host && config.data ? (
          <p className="text-ink-3 px-1 text-[12px]">当前平台不能安装移动插件。</p>
        ) : null}

        <DetailTabs idPrefix={idPrefix} items={tabs} value={activeTab} onChange={setTab} />
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-${activeTab}`}
          aria-labelledby={`${idPrefix}-tab-${activeTab}`}
          className="flex flex-col gap-3"
        >
          {activeTab === "intro" && (
            <IntroTab
              pluginId={pluginId}
              release={center}
              loading={!!latest && release.isPending}
              editor={!!installed?.editor}
            />
          )}
          {activeTab === "settings" && installed && (
            <SettingsTab runtime={runtime} item={installed} draft={draft} />
          )}
          {activeTab === "permissions" && runtime?.data && installed && (
            <PluginOperations
              data={runtime.data}
              pluginId={pluginId}
              database={runtime.workspaceId}
            />
          )}
          {activeTab === "permissions" && runtime?.permissions && installed && (
            <PluginPermissionControls
              broker={runtime.permissions}
              database={runtime.workspaceId}
              pluginId={pluginId}
              pluginName={installed.name ?? pluginId}
              permissions={permissions}
            />
          )}
          {activeTab === "permissions" && (
            <PermissionsTab
              permissions={permissions}
              contributions={installed?.active && runtime ? runtime.contributions(pluginId) : null}
              installed={!!installed}
              pluginId={pluginId}
              mcpSourceId={
                runtime?.aiMcp?.getSnapshot().find(state => state.pluginId === pluginId)?.id
              }
            />
          )}
          {activeTab === "versions" && (
            <section className="flex flex-col gap-3">
              {history.length > 0 ? (
                <div className="bg-surface overflow-hidden rounded-2xl">
                  <ReleaseHistoryList
                    platformLabel={host ? PLATFORM_LABELS[host.platform] : "本平台"}
                    items={history.map((item, index) => {
                      const minAppVersion = host && item.targets[host.platform]?.minAppVersion;
                      return {
                        releaseId: item.releaseId,
                        version: item.version,
                        publishedAt: item.publishedAt,
                        declared: !host || !!item.targets[host.platform],
                        requiredAppVersion:
                          host &&
                          minAppVersion &&
                          comparePluginVersions(host.appVersion, minAppVersion) < 0
                            ? minAppVersion
                            : undefined,
                        latest: index === 0,
                        compatible: item.releaseId === compatible?.releaseId,
                        installed: item.version === installed?.version,
                      };
                    })}
                  />
                </div>
              ) : (
                <p className="text-ink-3 px-1 text-[13px]">
                  {versions.isPending ? "正在读取历史版本…" : "暂时读取不到插件中心的版本记录。"}
                </p>
              )}
              {versions.hasNextPage && (
                <Button
                  className="min-h-11 self-center"
                  loading={versions.isFetchingNextPage}
                  onClick={() => void versions.fetchNextPage()}
                >
                  加载更多版本
                </Button>
              )}
              <p className="text-ink-3 px-1 text-[12px]">
                切换版本只替换插件代码，不回退已保存的数据；上一版代码可在 ⋯ 菜单中恢复。
              </p>
              {center?.content.changelog && (
                <Group title="更新日志">
                  <PluginMarkdown source={center.content.changelog} />
                </Group>
              )}
              {latest && (
                <details className="bg-surface rounded-2xl px-3.5 py-3">
                  <summary className="text-ink-2 cursor-pointer text-[13px] font-semibold">
                    兼容性详情
                  </summary>
                  <div className="pt-3">
                    <TargetSummary targets={latest.targets} platform={host?.platform ?? null} />
                  </div>
                </details>
              )}
            </section>
          )}
        </div>
      </div>
      {installing && (
        <CenterInstallSheet
          pluginId={pluginId}
          name={name}
          installedVersion={installed?.version ?? null}
          installedPermissions={installed?.permissions}
          onClose={() => setInstalling(false)}
        />
      )}
      {installed && (
        <PluginManageSheet
          open={managing}
          item={installed}
          onClose={() => setManaging(false)}
          onAction={kind => swallow(manager.actions.run(kind, pluginId))}
        />
      )}
    </PluginPageShell>
  );
}

function Hero({
  pluginId,
  name,
  publisher,
  version,
  installed,
  phase,
  taskError,
  category,
}: {
  pluginId: string;
  name: string;
  publisher: string | null;
  version: string | null;
  installed: ManagedPluginItem | null;
  phase: ReturnType<typeof storeTaskPhase>;
  taskError: unknown;
  category: Parameters<typeof categoryLabel>[0] | null;
}) {
  const status = installed ? lifecycleOf(installed, phase, taskError) : null;
  return (
    <header className="flex items-center gap-3.5 pt-1">
      <PluginIcon id={pluginId} name={name} size="xl" />
      <div className="min-w-0 flex-1">
        <h1 className="text-ink-1 text-[21px] leading-tight font-extrabold">{name}</h1>
        <p className="text-ink-2 mt-0.5 truncate text-[12.5px]">
          {[publisher && `@${publisher}`, version && `v${version}`].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {status && (
            <span
              className={cn(
                "rounded-full px-2 py-px text-[11px] font-semibold",
                TONE_CLASS[STATUS_DISPLAY[status.kind].tone]
              )}
            >
              {STATUS_DISPLAY[status.kind].label}
            </span>
          )}
          {category && (
            <span className="bg-surface text-ink-2 rounded-full px-2 py-px text-[11px] font-semibold">
              {categoryLabel(category)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function EnableSwitch({
  item,
  manager,
}: {
  item: ManagedPluginItem;
  manager: ReturnType<typeof usePluginManager>;
}) {
  const kind = item.enabled ? "disable" : "enable";
  return (
    <label className="bg-surface flex h-11 min-w-0 flex-1 items-center gap-3 rounded-[14px] px-3.5">
      <span className="text-ink-1 flex-1 text-[14px] font-semibold">
        {item.enabled ? "已启用" : "已停用"}
      </span>
      <Switch
        aria-label={`${item.enabled ? "停用" : "启用"} ${item.name}`}
        checked={item.enabled}
        disabled={!item.actions[kind].allowed}
        onCheckedChange={() => swallow(manager.actions.run(kind, item.id))}
      />
    </label>
  );
}

function Stats({
  release,
  host,
}: {
  release: CenterRelease;
  host: keyof CenterRelease["targets"] | null;
}) {
  const minApp = host ? release.targets[host]?.minAppVersion : undefined;
  const cells: [string, string][] = [
    ["版本", `v${release.version}`],
    ["大小", formatSize(release.size)],
    ...(minApp ? ([["需要 Tau", `≥ ${minApp}`]] as [string, string][]) : []),
    ["发布于", release.publishedAt.slice(0, 10)],
  ];
  return (
    <dl
      className={cn(
        "bg-surface grid rounded-2xl py-2.5",
        cells.length === 4 ? "grid-cols-4" : "grid-cols-3"
      )}
    >
      {cells.map(([label, value], index) => (
        <div
          key={label}
          className={cn(
            "flex min-w-0 flex-col items-center px-1",
            index > 0 && "border-line-2 border-l"
          )}
        >
          <dd className="text-ink-1 max-w-full truncate text-[13.5px] font-bold tabular-nums">
            {value}
          </dd>
          <dt className="text-ink-3 text-[10.5px]">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-ink-3 px-1 text-[12px] font-semibold">{title}</h2>
      <div className="bg-surface rounded-2xl px-3.5 py-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line-2 flex items-center justify-between gap-3 py-2.5 text-[13px] [&+&]:border-t">
      <dt className="text-ink-3 shrink-0">{label}</dt>
      <dd className="text-ink-1 flex min-w-0 items-center gap-1 truncate">{children}</dd>
    </div>
  );
}

function IntroTab({
  pluginId,
  release,
  loading,
  editor,
}: {
  pluginId: string;
  release: CenterRelease | null;
  loading: boolean;
  editor: boolean;
}) {
  const manifest = release?.content.manifest;
  return (
    <>
      {release ? (
        <p className="text-ink-2 px-1 text-[13.5px] leading-relaxed">{manifest?.description}</p>
      ) : null}
      {release?.content.readme ? (
        <PluginMarkdown source={release.content.readme} />
      ) : (
        <p className="text-ink-3 px-1 text-[13px]">
          {loading
            ? "正在读取说明…"
            : release
              ? "此插件没有提供说明。"
              : "未连上插件中心，暂时读取不到说明。"}
        </p>
      )}
      {editor && (
        <p className="text-ink-3 px-1 text-[12px]">
          移动搜索暂不检索插件块内部源码；正文及导出仍保留原内容。
        </p>
      )}
      <Group title="信息">
        <dl>
          <InfoRow label="插件 ID">
            <span className="truncate font-mono text-[12px]">{pluginId}</span>
          </InfoRow>
          {manifest?.categories?.length ? (
            <InfoRow label="分类">{manifest.categories.map(categoryLabel).join("、")}</InfoRow>
          ) : null}
          {release?.repository && (
            <InfoRow label="源码">
              <button
                type="button"
                className="text-accent-text flex min-w-0 items-center gap-1"
                onClick={() => open(release.repository)}
              >
                <Github size={13} className="shrink-0" aria-hidden />
                <span className="truncate">
                  {release.repository.replace(/^https:\/\/github\.com\//, "")}
                </span>
              </button>
            </InfoRow>
          )}
          {release && (
            <InfoRow label="SHA-256">
              <span className="font-mono text-[12px]">{release.sha256.slice(0, 12)}…</span>
            </InfoRow>
          )}
        </dl>
      </Group>
    </>
  );
}

function SettingsTab({
  runtime,
  item,
  draft,
}: {
  runtime: MobilePluginRuntime | null;
  item: ManagedPluginItem;
  draft: SettingsDraftController;
}) {
  const navigator = useNavigator();
  const { phase } = useMobilePluginStatus();
  const sections = [...(runtime?.settings.entries() ?? [])].filter(
    ([, entry]) => entry.context.pluginId === item.id && runtime?.active(entry.context)
  );
  const [selected, setSelected] = useState<string | null>(null);
  if (!item.active)
    return phase === "starting" ? (
      <Loading minHeight={160} label="插件加载中…" />
    ) : (
      <p className="text-ink-3 px-1 py-4 text-[13px]">
        插件设置暂不可用。启用并生效后可修改，已保存的偏好仍然保留。
      </p>
    );
  if (!sections.length)
    return <p className="text-ink-3 px-1 py-4 text-[13px]">此插件没有自定义设置。</p>;
  const [id, active] = sections.find(([key]) => key === selected) ?? sections[0];
  const Component = active.definition.component;
  return (
    <>
      {sections.length > 1 && (
        <nav aria-label="插件设置分组" className="flex flex-wrap gap-2">
          {sections.map(([key, entry]) => (
            <Button
              key={key}
              size="sm"
              variant={key === id ? "soft" : "ghost"}
              aria-current={key === id ? "page" : undefined}
              onClick={() => void draft.confirmLeave().then(leave => leave && setSelected(key))}
            >
              {entry.definition.title}
            </Button>
          ))}
        </nav>
      )}
      <section aria-label={active.definition.title} className="min-w-0">
        {active.definition.target === "tts" ||
        active.definition.target === "asr" ||
        active.definition.target === "images" ? (
          <MobileProviderSettings key={id} entry={active} />
        ) : active.definition.target === "sync" || active.definition.target === "upload" ? (
          <Button
            onClick={() =>
              navigator.push(
                active.definition.target === "sync" ? "syncProvider" : "uploadProvider",
                {
                  providerId: active.context.pluginId,
                }
              )
            }
          >
            {active.definition.target === "sync" ? "打开同步配置" : "打开上传配置"}
          </Button>
        ) : Component ? (
          <SettingsDraftProvider controller={draft}>
            <ErrorBoundary key={id}>
              <PluginSettingsCard>
                <PluginPageComponentScope context={active.context} guard={draft.confirmLeave}>
                  <Component context={active.context} />
                </PluginPageComponentScope>
              </PluginSettingsCard>
            </ErrorBoundary>
            <SettingsDraftBar controller={draft} />
            <SettingsLeaveSheet controller={draft} />
          </SettingsDraftProvider>
        ) : null}
      </section>
    </>
  );
}

const CONTRIBUTION_LABELS = {
  elements: "正文块",
  pages: "页面",
  entries: "功能入口",
  settings: "设置页",
  homePanels: "今天页卡片",
  skills: "Skill",
  mcp: "MCP",
} as const;

function PermissionsTab({
  permissions,
  contributions,
  installed,
  pluginId,
  mcpSourceId,
}: {
  permissions: readonly string[];
  contributions: Record<keyof typeof CONTRIBUTION_LABELS, number> | null;
  installed: boolean;
  pluginId: string;
  mcpSourceId?: string;
}) {
  const navigator = useNavigator();
  // Skill 与 MCP 可点：直达对应管理页，其余贡献只展示数量
  const openers: Partial<Record<keyof typeof CONTRIBUTION_LABELS, () => void>> = {
    skills: () => navigator.push("aiSkills", { sourceId: pluginId }),
    ...(mcpSourceId ? { mcp: () => navigator.push("aiMcpDetail", { sourceId: mcpSourceId }) } : {}),
  };
  const provided = contributions
    ? (Object.keys(CONTRIBUTION_LABELS) as (keyof typeof CONTRIBUTION_LABELS)[]).filter(
        key => contributions[key] > 0
      )
    : [];
  return (
    <>
      {installed && (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-ink-3 px-1 text-[12px] font-semibold">此插件提供</h2>
          {provided.length ? (
            <ul className="flex flex-wrap gap-2">
              {provided.map(key => {
                const open = openers[key];
                const label = (
                  <>
                    {CONTRIBUTION_LABELS[key]}
                    <span className="text-ink-3 tabular-nums">{contributions?.[key]}</span>
                    {open && <ChevronRight size={12} className="text-ink-3" aria-hidden />}
                  </>
                );
                const className =
                  "bg-surface text-ink-1 flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12.5px]";
                return (
                  <li key={key}>
                    {open ? (
                      <button type="button" className={className} onClick={open}>
                        {label}
                      </button>
                    ) : (
                      <span className={className}>{label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-3 flex items-center gap-2 px-1 text-[12.5px]">
              <Layers size={14} aria-hidden />
              {contributions ? "没有登记可展示的功能" : "启用并生效后可见"}
            </p>
          )}
        </section>
      )}
      <Group title="插件声明的权限">
        {permissions.length ? (
          <ul className="flex flex-col">
            {describeCenterPermissions(permissions).map(item => (
              <li
                key={item.permission}
                className="border-line-2 text-ink-1 py-2 text-[13px] [&+&]:border-t"
              >
                {item.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 text-[13px]">不需要额外权限</p>
        )}
      </Group>
      <div className="bg-warn-soft text-ink-2 flex gap-2 rounded-[14px] px-3 py-2.5 text-[11.5px] leading-relaxed">
        <ShieldAlert size={16} className="text-warn mt-0.5 shrink-0" aria-hidden />
        <span>
          插件在应用环境中运行，可以读取和修改你的笔记数据。插件中心审核功能与来源，但不保证没有缺陷，请只安装你信任的插件。
        </span>
      </div>
    </>
  );
}
