/**
 * 同步设置 —— 定稿初版（2026-09-22/23，mockups/settings/sync-plans.html）。
 *
 * 语义对齐 legacy（只重做排版与主题语言）：同步全手动；凭据（账号/Token/AK）
 * 全部在「集成」子页配置，本页只配存储定位（桶/仓库/路径前缀）。
 *
 * 状态卡（2026-09-23 用户校准：垂直三段重排防拥挤 + 「软件更新」语义）：
 * - 检查更新：探测远程版本——有新版本时动作行切换为「下载更新」主按钮；
 *   无则显示「已是最新」徽标
 * - 同步到云端：本地 → 远端上传；本地落后远程时弹风险确认（远端新变更将被
 *   覆盖），用户可强制同步
 *
 * 2026-09-24 第三版重排：页内分「概览 / 资源文件」两个 Tab。概览 = 数据库卡 + 资源文件卡
 * 并排（资源目录同步从资源存储页迁入：它与上传目标无关、与数据库共用远端）+ 同步目标；
 * 资源文件 Tab = 文件列表与黑名单（sections/ResourceSync.tsx）。
 * 同日追加「本地数据库」Tab：切换 / 新建 / 删除本地库（从 legacy 关于页「数据库管理」迁入，
 * 实现见 sections/LocalDatabasePanel.tsx）。
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CloudUpload, Database, Download, RefreshCw } from "lucide-react";
import { produce } from "immer";
import { SYNC_MODEL_VERSION } from "@tau/db-schema/sync-protocol";
import { Button, ConfirmDialog, Input, Panel, Segmented, Select, toast } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import { PluginSettingsView } from "@/features/plugins/views/PluginSettingsView";
import { savePluginSyncConfig } from "@/commands/plugin-local";
import { copyJson } from "@tau/plugins/host";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { download, getOriginDatabaseInfo, upload } from "@/commands";
import { isSyncConfigured } from "@/utils/sync";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { runUsageSync } from "@/services/usageSyncRunner";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { SettingsTabs } from "../components/SettingsTabs";
import { StatusChip } from "../components/StatusChip";
import { SyncActions, SyncStats } from "../components/SyncCard";
import { LocalDatabasePanel } from "./LocalDatabasePanel";
import { ResourceSyncCard, ResourceSyncFiles } from "./ResourceSync";
import { useResourceSyncModel, type FileFilter } from "./useResourceSyncModel";

type SyncTab = "overview" | "files" | "database";

const PROVIDER_LABELS: Record<ESync, string> = {
  [ESync.Plugin]: "同步插件",
  [ESync.Github]: "GitHub",
};

/** 各家存储定位字段（本页只写 sync 域；凭据在集成子页） */
const PROVIDER_FIELDS: Record<
  ESync,
  Array<{ key: string; label: string; description?: string; placeholder?: string }>
> = {
  [ESync.Plugin]: [],
  [ESync.Github]: [
    { key: "repo", label: "仓库" },
    { key: "branch", label: "分支" },
    { key: "pathPrefix", label: "路径前缀", description: "可选", placeholder: "如：sync/" },
  ],
};

const PROVIDER_ORDER: ESync[] = [ESync.Github];

const CREDENTIAL_HINTS: Record<ESync, string> = {
  [ESync.Plugin]: "",
  [ESync.Github]: "Personal Access Token",
};

export function SyncSection() {
  const queryClient = useQueryClient();
  const setting = useSettingStore(s => s.setting);
  const { sync, integration, database } = setting;
  const active = sync.active;
  const runtime = useDesktopPlugins();
  const pluginSections =
    runtime?.listSettings().filter(section => section.definition.target === "sync") ?? [];
  const [selectedPlugin, setSelectedPlugin] = useState("");
  const pluginId = selectedPlugin || sync.plugin?.id || pluginSections[0]?.context.pluginId || "";
  const pluginSection = pluginSections.find(section => section.context.pluginId === pluginId);
  const storedPluginConfig =
    sync.plugin && Object.hasOwn(sync.plugin.configurations, pluginId)
      ? sync.plugin.configurations[pluginId]
      : undefined;
  const pluginConfig = useMemo(() => copyJson(storedPluginConfig ?? {}), [storedPluginConfig]);
  const configKey = useMemo(() => (sync.plugin ? crypto.randomUUID() : ""), [sync.plugin]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const [forceSyncConfirmOpen, setForceSyncConfirmOpen] = useState(false);

  const activeDatabase = database.databases.find(item => item.name === database.active);
  const localVersion = activeDatabase?.version ?? 0;
  const selectedId = sync.plugin?.id;
  const pluginEnabled =
    !!selectedId &&
    (runtime?.local?.owns(selectedId)
      ? runtime.local.enabled(selectedId)
      : runtime?.host
          .listPlugins()
          .some(plugin => plugin.id === selectedId && plugin.state === "active"));
  const isConfigured =
    isSyncConfigured(active, sync, integration) && (active !== ESync.Plugin || pluginEnabled);

  /* 远程版本：网络查询，配置就绪才拉；检查更新 refetch，同步/下载后手动更新。
     key 含当前库、存储类型与定位字段：切换存储类型立即重新探测，同类型下的字段编辑防抖后再拉 */
  const rawTarget =
    active === ESync.Plugin
      ? JSON.stringify([active, sync.plugin?.id, configKey])
      : JSON.stringify([active, sync[active]]);
  const debouncedTarget = useDebouncedValue(rawTarget, 500);
  const remoteTarget = debouncedTarget.startsWith(`["${active}"`) ? debouncedTarget : rawTarget;
  const remoteKey = ["settings", "sync", "remote-version", database.active, remoteTarget];
  const remoteQuery = useQuery({
    queryKey: remoteKey,
    queryFn: async () => {
      const info = await getOriginDatabaseInfo();
      return info.databaseInfo;
    },
    enabled: isConfigured,
    staleTime: Infinity,
    retry: false,
  });
  const remoteKnown = isConfigured && remoteQuery.data !== undefined;
  const remoteVersion = remoteQuery.data?.version ?? 0;
  const needsProtocolUpgrade =
    remoteKnown && remoteQuery.data?.dataModelVersion !== SYNC_MODEL_VERSION && remoteVersion > 0;
  const hasUpdate = remoteKnown && remoteVersion > localVersion;

  const doUpload = async () => {
    setIsSyncing(true);
    try {
      const ok = await upload();
      if (ok) {
        queryClient.setQueryData(remoteKey, {
          version: localVersion + 1,
          dataModelVersion: SYNC_MODEL_VERSION,
        });
        toast.success("同步成功");
        // 用量记录搭车同步，后台跑、失败只记在用量统计页
        void runUsageSync();
      } else {
        toast.error("同步失败");
      }
    } catch (error) {
      toast.error(`同步失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  /* 本地落后远程时拦截并警示风险，用户可强制继续 */
  const onSyncClick = () => {
    if (isSyncing || !isConfigured) return;
    if (hasUpdate) {
      setForceSyncConfirmOpen(true);
      return;
    }
    void doUpload();
  };

  const onCheckUpdate = async () => {
    if (!isConfigured) return;
    setIsChecking(true);
    try {
      const info = await getOriginDatabaseInfo();
      const originVersion = info.databaseInfo.version;
      queryClient.setQueryData(remoteKey, info.databaseInfo);
      if (originVersion > 0 && info.databaseInfo.dataModelVersion !== SYNC_MODEL_VERSION) {
        toast.warning("云端快照协议较旧，请从已升级且数据完整的客户端同步到云端");
      } else if (localVersion < originVersion) {
        toast.success(`远程有新版本 v${originVersion}，可下载更新`);
      } else {
        toast.success("已是最新版本");
      }
    } catch (error) {
      toast.error(`检查失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsChecking(false);
    }
  };

  const onDownload = async () => {
    try {
      const ok = await download();
      if (ok) {
        queryClient.setQueryData(remoteKey, remoteQuery.data);
        toast.success("更新成功，已刷新数据库，原文件已备份至 backup 文件夹");
      } else {
        toast.error("下载失败");
      }
    } catch (error) {
      toast.error(`下载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateSyncField = (field: string, value: string) => {
    if (active === ESync.Plugin) return;
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        // ESync 键名与 sync 域字段一一对应（github）
        (draft.sync[active] as Record<string, string>)[field] = value;
      }),
    }));
  };

  const setActiveProvider = (provider: ESync) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.sync.active = provider;
      }),
    }));
  };

  const [tab, setTab] = useState<SyncTab>("overview");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const resourceSync = useResourceSyncModel();

  const dbChip = !isConfigured ? (
    <StatusChip tone="warn">未配置</StatusChip>
  ) : remoteQuery.isFetching ? (
    <StatusChip tone="accent">检查中</StatusChip>
  ) : remoteQuery.isError ? (
    <StatusChip tone="danger">
      {/DB_MODEL_INCOMPATIBLE/.test(String(remoteQuery.error)) ? "协议不兼容" : "检查失败"}
    </StatusChip>
  ) : !remoteKnown ? (
    <StatusChip>未检查</StatusChip>
  ) : needsProtocolUpgrade ? (
    <StatusChip tone="warn">需升级云端</StatusChip>
  ) : hasUpdate ? (
    <StatusChip tone="warn">远程有更新</StatusChip>
  ) : (
    <StatusChip tone="ok">已是最新</StatusChip>
  );

  return (
    <>
      <SettingsTabs
        label="同步视图"
        value={tab}
        onChange={setTab}
        items={[
          { key: "overview", label: "概览" },
          { key: "files", label: "资源文件", badge: resourceSync.counts.error || undefined },
          { key: "database", label: "本地数据库" },
        ]}
      />

      {tab === "overview" ? (
        <>
          <SettingsGroup bare>
            <div className="grid grid-cols-2 gap-3">
              <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pb-3.5 pt-4">
                <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
                  <Database size={15} strokeWidth={1.75} className="text-ink-2" />
                  数据库
                  <span className="ml-auto font-normal">{dbChip}</span>
                </div>
                <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
                  {database.active}
                  {isConfigured &&
                    ` · ${
                      active === ESync.Plugin
                        ? (pluginSections.find(section => section.context.pluginId === selectedId)
                            ?.definition.title ?? selectedId)
                        : PROVIDER_LABELS[active]
                    }`}
                </div>
                <SyncStats
                  items={[
                    { label: "本地版本", value: localVersion },
                    {
                      label: "远程版本",
                      value: remoteKnown ? remoteVersion : "—",
                      valueClassName: hasUpdate ? "text-accent-text" : !remoteKnown && "text-ink-3",
                    },
                  ]}
                />
                <SyncActions>
                  {!isConfigured ? (
                    <span className="text-tau-meta text-ink-2">
                      在下方选择同步目标并完成配置后即可同步
                    </span>
                  ) : hasUpdate ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Download}
                        disabled={needsProtocolUpgrade}
                        onClick={() => setDownloadConfirmOpen(true)}
                      >
                        拉取远程
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={CloudUpload}
                        loading={isSyncing}
                        onClick={() => setForceSyncConfirmOpen(true)}
                      >
                        强制上传
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={CloudUpload}
                        loading={isSyncing}
                        loadingText="同步中…"
                        onClick={onSyncClick}
                      >
                        同步到云端
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RefreshCw}
                        loading={isChecking}
                        loadingText="检查中…"
                        onClick={() => void onCheckUpdate()}
                      >
                        检查
                      </Button>
                    </>
                  )}
                </SyncActions>
              </Panel>
              {isConfigured ? (
                <ResourceSyncCard
                  model={resourceSync}
                  onShowIssues={() => {
                    setFileFilter("error");
                    setTab("files");
                  }}
                />
              ) : (
                <Panel
                  pad="none"
                  className="text-tau-meta text-ink-2 grid place-items-center rounded-[14px] px-6 text-center"
                >
                  资源文件与数据库共用同一个远端，配置同步存储后即可镜像 resources 目录
                </Panel>
              )}
            </div>
          </SettingsGroup>

          <SettingsGroup title="同步目标" description="数据库与资源文件共用同一个远端">
            <SettingRow title="存储类型">
              <Segmented
                label="同步存储类型"
                size="sm"
                value={active}
                onValueChange={v => setActiveProvider(v as ESync)}
              >
                {[
                  ...PROVIDER_ORDER,
                  ...(pluginSections.length || active === ESync.Plugin ? [ESync.Plugin] : []),
                ].map(key => (
                  <Segmented.Item key={key} value={key} label={PROVIDER_LABELS[key]} />
                ))}
              </Segmented>
            </SettingRow>
            {active === ESync.Plugin && (
              <>
                <SettingRow title="同步插件">
                  <Select
                    aria-label="同步插件"
                    value={pluginId}
                    onValueChange={setSelectedPlugin}
                    options={pluginSections.map(section => ({
                      value: section.context.pluginId,
                      label: section.definition.title,
                    }))}
                  />
                </SettingRow>
                {pluginSection ? (
                  <PluginSettingsView
                    key={pluginSection.key}
                    section={pluginSection}
                    syncConfig={{
                      value: pluginConfig,
                      save: async config => {
                        await savePluginSyncConfig(pluginId, config);
                        useSettingStore.setState(state => ({
                          setting: produce(state.setting, draft => {
                            draft.sync.active = ESync.Plugin;
                            draft.sync.plugin = {
                              id: pluginId,
                              configurations: {
                                ...draft.sync.plugin?.configurations,
                                [pluginId]: config,
                              },
                            };
                          }),
                        }));
                      },
                    }}
                  />
                ) : (
                  <p role="status" className="text-ink-2 text-tau-body">
                    请先在插件页安装并启用同步插件；已保存配置不会因停用而删除。
                  </p>
                )}
              </>
            )}
            {active !== ESync.Plugin &&
              PROVIDER_FIELDS[active].map(field => (
                <SettingRow key={field.key} title={field.label} description={field.description}>
                  <Input
                    className="w-[260px]"
                    value={(sync[active] as Record<string, string>)[field.key] ?? ""}
                    placeholder={field.placeholder}
                    spellCheck={false}
                    onChange={e => updateSyncField(field.key, e.target.value)}
                  />
                </SettingRow>
              ))}
            {active !== ESync.Plugin && (
              <SettingRow title="账号凭据" description={CREDENTIAL_HINTS[active]}>
                <button
                  type="button"
                  className="text-tau-meta text-accent-text inline-flex items-center gap-1 font-medium hover:underline"
                  onClick={() => useSettingsStore.getState().openSettings("integration")}
                >
                  在「账号与连接」管理
                  <ArrowRight size={13} strokeWidth={1.75} />
                </button>
              </SettingRow>
            )}
          </SettingsGroup>
        </>
      ) : tab === "files" ? (
        <ResourceSyncFiles
          model={resourceSync}
          filter={fileFilter}
          onFilterChange={setFileFilter}
        />
      ) : (
        <LocalDatabasePanel />
      )}

      <ConfirmDialog
        open={downloadConfirmOpen}
        onOpenChange={setDownloadConfirmOpen}
        title="下载更新"
        context={database.active}
        description={`远程 v${remoteVersion} 有新版本，下载后将覆盖本地并刷新。`}
        impact="本地当前文件会备份至 backup 文件夹"
        confirmText="下载"
        onConfirm={onDownload}
      />
      <ConfirmDialog
        open={forceSyncConfirmOpen}
        onOpenChange={setForceSyncConfirmOpen}
        title="强制同步"
        context={database.active}
        danger
        description={`本地 v${localVersion} 落后于远程 v${remoteVersion}，继续同步将以本地内容覆盖远端。`}
        impact="远端新版本的变更将丢失"
        confirmText="强制同步"
        onConfirm={doUpload}
      />
    </>
  );
}
