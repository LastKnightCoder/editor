import { pluginTranslator, usePluginI18n, pluginPermission, pluginError } from "./i18n";
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
  formatPluginLocales,
  formatSize,
  pluginPortalUrl,
  resolvePluginMetadata,
  resolvePluginReadme,
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
import { storePrimaryAction, storeActionReason, storeTaskPhase } from "./components/storeActions";
import {
  useMobileCenterConfig,
  useMobileCenterInstall,
  useMobileCenterRelease,
  useMobileCenterResolution,
  useMobileCenterVersions,
} from "./data/center-queries";
import { usePluginManager, type ManagedPluginItem } from "./data/usePluginManager";
const t = pluginTranslator.t;

type DetailTab = "intro" | "settings" | "permissions" | "versions";

const swallow = (action: Promise<unknown>) => void action.catch(() => undefined);
const open = (url: string) => swallow(openUrl(url));

/**
 * 插件详情：商店资料与已安装管理合一。头部回答「是什么、能不能用、在不在运行」，
 * 下方分段标签承载介绍、设置、权限与版本；资料取本平台最高声明版本，安装取选版结果。
 * 未连上插件中心时（开发安装、离线）只展示本机已安装信息。
 */
export function PluginDetail() {
  const { locale } = usePluginI18n();
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
        <Loading minHeight={240} label={t("center.loading")} />
      </PluginPageShell>
    );
  if (!installed && (failure || !latest || !center))
    return (
      <PluginPageShell title={t("detail.title")}>
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-ink-1 text-[15px] font-semibold">
            {failure ? t("detail.failed") : t("detail.notFound")}
          </p>
          <p className="text-ink-2 text-[13px] break-words">
            {failure ? String(failure) : t("detail.notFoundHint")}
          </p>
          {failure && (
            <Button
              className="min-h-11"
              onClick={() => void (config.isError ? config.refetch() : versions.refetch())}
            >
              {t("common.retry")}
            </Button>
          )}
        </div>
      </PluginPageShell>
    );

  const manifest = center?.content.manifest;
  const name = resolvePluginMetadata(
    {
      name: manifest?.name ?? installed?.name ?? pluginId,
      i18n: manifest?.i18n ?? installed?.i18n,
    },
    locale
  ).name;
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
    { key: "intro", label: t("detail.intro") },
    ...(installed ? [{ key: "settings" as const, label: t("common.settings") }] : []),
    { key: "permissions", label: t("detail.permissions") },
    { key: "versions", label: t("detail.versions") },
  ];
  const activeTab = tabs.some(item => item.key === tab) ? tab : "intro";

  return (
    <PluginPageShell
      actions={
        <>
          <PageHeaderButton
            icon={<ExternalLink size={19} strokeWidth={2.2} />}
            aria-label={t("detail.openPortal")}
            onClick={() => open(pluginPortalUrl(pluginId))}
          />
          {installed && manager.managementEnabled && (
            <PageHeaderButton
              icon={<MoreHorizontal size={22} strokeWidth={2.4} />}
              aria-label={t("detail.manage")}
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
        {storeActionReason(primary) && (
          <p className="text-ink-3 text-[12px]">{storeActionReason(primary)}</p>
        )}
        {installed && hasPendingChange(installed) && <PluginChangesBanner changes={[name]} />}
        {installed?.error && (
          <p role="alert" className="text-danger text-[12.5px] break-words">
            {installed.errorCode ? t(installed.errorCode) : installed.error}
          </p>
        )}
        {latest && center && <Stats release={center} host={host?.platform ?? null} />}
        {host && resolution.isPending ? (
          <p className="text-ink-3 px-1 text-[12px]">{t("detail.checking")}</p>
        ) : resolution.data && latest ? (
          <CompatibilityNote
            latestVersion={latest.version}
            compatibleVersion={compatible?.version ?? null}
            compatibility={resolution.data.compatibility}
          />
        ) : resolution.isError ? (
          <p role="alert" className="text-danger text-[12px]">
            {t("detail.checkFailed", { error: pluginError(resolution.error) })}
          </p>
        ) : !host && config.data ? (
          <p className="text-ink-3 px-1 text-[12px]">{t("detail.mobileUnsupported")}</p>
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
              installedLocales={installed?.locales}
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
                    platformLabel={host ? PLATFORM_LABELS[host.platform] : t("detail.thisPlatform")}
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
                  {versions.isPending
                    ? t("detail.loadingVersions")
                    : t("detail.versionsUnavailable")}
                </p>
              )}
              {versions.hasNextPage && (
                <Button
                  className="min-h-11 self-center"
                  loading={versions.isFetchingNextPage}
                  onClick={() => void versions.fetchNextPage()}
                >
                  {t("detail.moreVersions")}
                </Button>
              )}
              <p className="text-ink-3 px-1 text-[12px]">{t("detail.versionHint")}</p>
              {center?.content.changelog && (
                <Group title={t("detail.changelog")}>
                  <PluginMarkdown source={center.content.changelog} />
                </Group>
              )}
              {latest && (
                <details className="bg-surface rounded-2xl px-3.5 py-3">
                  <summary className="text-ink-2 cursor-pointer text-[13px] font-semibold">
                    {t("detail.compatibilityDetails")}
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
          onAction={(kind, purgeData) => swallow(manager.actions.run(kind, pluginId, purgeData))}
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
  usePluginI18n();
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
  const { locale } = usePluginI18n();
  const kind = item.enabled ? "disable" : "enable";
  return (
    <label className="bg-surface flex h-11 min-w-0 flex-1 items-center gap-3 rounded-[14px] px-3.5">
      <span className="text-ink-1 flex-1 text-[14px] font-semibold">
        {item.enabled ? t("state.active") : t("state.disabled")}
      </span>
      <Switch
        aria-label={t(item.enabled ? "manage.disableName" : "manage.enableName", {
          name: resolvePluginMetadata(item, locale).name,
        })}
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
  const { locale } = usePluginI18n();
  const minApp = host ? release.targets[host]?.minAppVersion : undefined;
  const cells: [string, string][] = [
    [t("detail.version"), `v${release.version}`],
    [t("detail.size"), formatSize(release.size)],
    ...(minApp ? ([[t("detail.requireTau"), `≥ ${minApp}`]] as [string, string][]) : []),
    [
      t("detail.published"),
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(release.publishedAt)),
    ],
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
          key={index}
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
  usePluginI18n();
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-ink-3 px-1 text-[12px] font-semibold">{title}</h2>
      <div className="bg-surface rounded-2xl px-3.5 py-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  usePluginI18n();
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
  installedLocales,
  loading,
  editor,
}: {
  pluginId: string;
  release: CenterRelease | null;
  installedLocales?: readonly string[];
  loading: boolean;
  editor: boolean;
}) {
  const { locale } = usePluginI18n();
  const manifest = release?.content.manifest;
  const description = manifest ? resolvePluginMetadata(manifest, locale).description : "";
  const readme = release ? resolvePluginReadme(release.content, locale) : "";
  const declaredLocales = manifest?.locales ?? installedLocales;
  return (
    <>
      {release && description ? (
        <p className="text-ink-2 px-1 text-[13.5px] leading-relaxed">{description}</p>
      ) : null}
      {readme ? (
        <PluginMarkdown source={readme} />
      ) : (
        <p className="text-ink-3 px-1 text-[13px]">
          {loading
            ? t("detail.reading")
            : release
              ? t("detail.noReadme")
              : t("detail.offlineReadme")}
        </p>
      )}
      {editor && <p className="text-ink-3 px-1 text-[12px]">{t("detail.searchHint")}</p>}
      <Group title={t("detail.info")}>
        <dl>
          <InfoRow label={t("detail.pluginId")}>
            <span className="truncate font-mono text-[12px]">{pluginId}</span>
          </InfoRow>
          {manifest?.categories?.length ? (
            <InfoRow label={t("category.label")}>
              {manifest.categories.map(categoryLabel).join("、")}
            </InfoRow>
          ) : null}
          {declaredLocales?.length ? (
            <InfoRow label={t("detail.languages")}>
              {formatPluginLocales(declaredLocales, locale).join(
                locale.startsWith("zh") ? "、" : ", "
              )}
            </InfoRow>
          ) : null}
          {release?.repository && (
            <InfoRow label={t("detail.source")}>
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
  usePluginI18n();
  const navigator = useNavigator();
  const { phase } = useMobilePluginStatus();
  const sections = [...(runtime?.settings.entries() ?? [])].filter(
    ([, entry]) => entry.context.pluginId === item.id && runtime?.active(entry.context)
  );
  const [selected, setSelected] = useState<string | null>(null);
  if (!item.active)
    return phase === "starting" ? (
      <Loading minHeight={160} label={t("center.pluginLoading")} />
    ) : (
      <p className="text-ink-3 px-1 py-4 text-[13px]">{t("detail.settingsUnavailable")}</p>
    );
  if (!sections.length)
    return <p className="text-ink-3 px-1 py-4 text-[13px]">{t("detail.noSettings")}</p>;
  const [id, active] = sections.find(([key]) => key === selected) ?? sections[0];
  const Component = active.definition.component;
  return (
    <>
      {sections.length > 1 && (
        <nav aria-label={t("detail.settingsGroups")} className="flex flex-wrap gap-2">
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
            {active.definition.target === "sync"
              ? t("detail.syncConfig")
              : t("detail.uploadConfig")}
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
  get elements() {
    return t("detail.contentBlocks");
  },
  get pages() {
    return t("category.page");
  },
  get entries() {
    return t("contribution.navigation");
  },
  get settings() {
    return t("detail.settingsPage");
  },
  get homePanels() {
    return t("detail.todayCards");
  },
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
  usePluginI18n();
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
          <h2 className="text-ink-3 px-1 text-[12px] font-semibold">{t("detail.provides")}</h2>
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
              {contributions ? t("detail.noContributions") : t("detail.enabledVisible")}
            </p>
          )}
        </section>
      )}
      <Group title={t("detail.permissionsDeclared")}>
        {permissions.length ? (
          <ul className="flex flex-col">
            {describeCenterPermissions(permissions).map(item => (
              <li
                key={item.permission}
                className="border-line-2 text-ink-1 py-2 text-[13px] [&+&]:border-t"
              >
                {pluginPermission(item.permission)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 text-[13px]">{t("install.noPermissions")}</p>
        )}
      </Group>
      <div className="bg-warn-soft text-ink-2 flex gap-2 rounded-[14px] px-3 py-2.5 text-[11.5px] leading-relaxed">
        <ShieldAlert size={16} className="text-warn mt-0.5 shrink-0" aria-hidden />
        <span>{t("detail.riskMobile")}</span>
      </div>
    </>
  );
}
