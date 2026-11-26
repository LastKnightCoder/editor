/** 同步操作由客户端负责，存储配置由启用的同步插件提供。 */

import { formatDatabaseSyncStatus, type DatabaseSyncStatus } from "@tau/shared/sync-progress";
import { syncTranslator, useSyncI18n } from "../sync/i18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Database, Download, RefreshCw } from "lucide-react";
import { localDatabaseVersion } from "@tau/db-schema/sync-protocol";
import { Button, ConfirmDialog, Panel, ProgressStatus, toast } from "@tau/ui";
import { useDesktopPlugins } from "@/app/plugins/context";
import useSettingStore from "@/stores/useSettingStore";
import { download, getRemoteDatabaseVersion, upload } from "@/commands";
import { isSyncConfigured } from "@/utils/sync";
import { runUsageSync } from "@/services/usageSyncRunner";
import { useSyncProviderSwitch } from "@/hooks/useSyncProviderSwitch";
import { SettingsGroup } from "../components/SettingsGroup";
import { SettingsTabs } from "../components/SettingsTabs";
import { StatusChip } from "../components/StatusChip";
import { SyncActions, SyncStats } from "../components/SyncCard";
import { LocalDatabasePanel } from "./LocalDatabasePanel";
import { isProviderSection, ProviderChoiceList } from "../components/ProviderChoiceList";
import { ResourceSyncCard, ResourceSyncFiles } from "./ResourceSync";
import { useResourceSyncModel, type FileFilter } from "./useResourceSyncModel";

type SyncTab = "overview" | "database";

export function SyncSection() {
  const { locale } = useSyncI18n();
  const queryClient = useQueryClient();
  const setting = useSettingStore(s => s.setting);
  const { sync, database } = setting;
  const active = sync.active;
  const runtime = useDesktopPlugins();
  const pluginSections =
    runtime?.listSettings().filter(section => isProviderSection(section, "sync")) ?? [];
  const switcher = useSyncProviderSwitch();
  const storedConfig = sync.plugin?.id ? sync.plugin.configurations[sync.plugin.id] : undefined;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncStatus, setSyncStatus] = useState<DatabaseSyncStatus | null>(null);
  const [syncDirection, setSyncDirection] = useState<"upload" | "download" | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const [forceSyncConfirmOpen, setForceSyncConfirmOpen] = useState(false);

  const activeDatabase = database.databases.find(item => item.name === database.active);
  const localVersion = localDatabaseVersion(activeDatabase);
  const selectedId = sync.plugin?.id;
  const pluginState = runtime?.host.listPlugins().find(plugin => plugin.id === selectedId)?.state;
  const pluginEnabled =
    !!selectedId &&
    (runtime?.local?.owns(selectedId)
      ? runtime.local.enabled(selectedId)
      : pluginState === "active");
  const isConfigured = isSyncConfigured(active, sync) && pluginEnabled;
  // 启用意图先于异步激活完成，检查与同步必须等待当前窗口的插件就绪。
  const isReady = isConfigured && pluginState === "active";

  /* 远程版本：网络查询，配置就绪才拉；检查更新 refetch，同步/下载后手动更新。
     key 含当前库、服务与已保存配置：切换服务或在插件页保存新配置后重新探测 */
  const remoteKey = [
    "settings",
    "sync",
    "remote-version",
    database.active,
    sync.plugin?.id ?? "",
    JSON.stringify(storedConfig ?? null),
  ];
  const remoteQuery = useQuery({
    queryKey: remoteKey,
    queryFn: getRemoteDatabaseVersion,
    enabled: isReady,
    staleTime: Infinity,
    retry: false,
  });
  const remoteKnown = isReady && remoteQuery.data !== undefined;
  const remoteVersion = remoteQuery.data?.version ?? 0;
  const hasUpdate = remoteKnown && remoteVersion > localVersion;

  const doUpload = async () => {
    if (isSyncing || !isReady) return;
    setIsSyncing(true);
    setSyncDirection("upload");
    setSyncPercent(0);
    setSyncStatus({ kind: "prepare-upload" });
    try {
      const ok = await upload({
        onProgress: ({ value, status }) => {
          setSyncPercent(value);
          setSyncStatus(status);
        },
      });
      if (ok) {
        queryClient.setQueryData(remoteKey, {
          version: localDatabaseVersion(
            useSettingStore
              .getState()
              .setting.database.databases.find(item => item.name === database.active)
          ),
        });
        toast.success(syncTranslator.t("feedback.synced"));
        // 用量记录搭车同步，后台跑、失败只记在用量统计页
        void runUsageSync();
      } else {
        toast.error(syncTranslator.t("error.sync"));
      }
    } catch (error) {
      toast.error(
        syncTranslator.t("error.withReason", {
          reason: error instanceof Error ? error.message : String(error),
          message: syncTranslator.t("error.sync"),
        })
      );
    } finally {
      setIsSyncing(false);
      setSyncDirection(null);
    }
  };

  /* 本地落后远程时拦截并警示风险，用户可强制继续 */
  const onSyncClick = () => {
    if (isSyncing || !isReady) return;
    if (hasUpdate) {
      setForceSyncConfirmOpen(true);
      return;
    }
    void doUpload();
  };

  const onCheckUpdate = async () => {
    if (!isReady || isSyncing) return;
    setIsChecking(true);
    try {
      const remote = await getRemoteDatabaseVersion();
      const originVersion = remote.version;
      queryClient.setQueryData(remoteKey, remote);
      if (localVersion < originVersion) {
        toast.success(syncTranslator.t("feedback.remoteVersion", { version: originVersion }));
      } else {
        toast.success(syncTranslator.t("feedback.latest"));
      }
    } catch (error) {
      toast.error(
        syncTranslator.t("error.withReason", {
          reason: error instanceof Error ? error.message : String(error),
          message: syncTranslator.t("error.check"),
        })
      );
    } finally {
      setIsChecking(false);
    }
  };

  const onDownload = async () => {
    if (isSyncing || !isReady) return;
    setIsSyncing(true);
    setSyncDirection("download");
    setSyncPercent(0);
    setSyncStatus({ kind: "prepare-download" });
    try {
      const ok = await download({
        onProgress: ({ value, status }) => {
          setSyncPercent(value);
          setSyncStatus(status);
        },
      });
      if (ok) {
        queryClient.setQueryData(remoteKey, remoteQuery.data);
        toast.success(syncTranslator.t("feedback.downloaded"));
      } else {
        toast.error(syncTranslator.t("error.download"));
      }
    } catch (error) {
      toast.error(
        syncTranslator.t("error.withReason", {
          reason: error instanceof Error ? error.message : String(error),
          message: syncTranslator.t("error.download"),
        })
      );
    } finally {
      setIsSyncing(false);
      setSyncDirection(null);
    }
  };

  const [tab, setTab] = useState<SyncTab>("overview");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const resourceSync = useResourceSyncModel();

  const dbChip = !isConfigured ? (
    <StatusChip tone="warn">{syncTranslator.t("status.unconfigured")}</StatusChip>
  ) : !isReady ? (
    <StatusChip tone="warn">
      {pluginState === "failed" || pluginState === "restart-required"
        ? syncTranslator.t("status.pluginUnavailable")
        : syncTranslator.t("status.preparing")}
    </StatusChip>
  ) : isSyncing ? (
    <StatusChip tone="accent">
      {syncDirection === "download"
        ? syncTranslator.t("status.downloading")
        : syncTranslator.t("status.uploading")}
    </StatusChip>
  ) : remoteQuery.isFetching ? (
    <StatusChip tone="accent">{syncTranslator.t("status.checking")}</StatusChip>
  ) : remoteQuery.isError ? (
    <StatusChip tone="danger">{syncTranslator.t("error.check")}</StatusChip>
  ) : !remoteKnown ? (
    <StatusChip>{syncTranslator.t("status.unchecked")}</StatusChip>
  ) : hasUpdate ? (
    <StatusChip tone="warn">{syncTranslator.t("status.remoteNewer")}</StatusChip>
  ) : (
    <StatusChip tone="ok">{syncTranslator.t("status.latest")}</StatusChip>
  );

  return (
    <>
      <SettingsTabs
        label={syncTranslator.t("tabs.label")}
        value={tab}
        onChange={setTab}
        items={[
          { key: "overview", label: syncTranslator.t("tabs.cloud") },
          { key: "database", label: syncTranslator.t("tabs.local") },
        ]}
      />

      {tab === "overview" ? (
        <>
          <SettingsGroup bare>
            <div className="grid grid-cols-2 gap-3">
              <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
                <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
                  <Database size={15} strokeWidth={1.75} className="text-ink-2" />
                  {syncTranslator.t("database")}
                  <span className="ml-auto font-normal">{dbChip}</span>
                </div>
                <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
                  {database.active}
                  {isConfigured &&
                    ` · ${
                      pluginSections.find(section => section.context.pluginId === selectedId)
                        ?.definition.title ?? selectedId
                    }`}
                </div>
                <SyncStats
                  items={[
                    { id: "local", label: syncTranslator.t("version.local"), value: localVersion },
                    {
                      id: "remote",
                      label: syncTranslator.t("version.remote"),
                      value: remoteKnown ? remoteVersion : "—",
                      valueClassName: hasUpdate ? "text-accent-text" : !remoteKnown && "text-ink-3",
                    },
                  ]}
                />
                {isSyncing && (
                  <ProgressStatus
                    className="mt-4"
                    value={syncPercent}
                    label={syncStatus ? formatDatabaseSyncStatus(syncStatus, locale) : ""}
                  />
                )}
                <SyncActions>
                  {!isConfigured ? (
                    <span className="text-tau-meta text-ink-2">
                      {syncTranslator.t("service.chooseHint")}
                    </span>
                  ) : hasUpdate ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Download}
                        disabled={isSyncing || !isReady}
                        onClick={() => setDownloadConfirmOpen(true)}
                      >
                        {syncTranslator.t("action.pull")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={CloudUpload}
                        loading={syncDirection === "upload"}
                        loadingText={syncTranslator.t("progress.uploadPercent", {
                          percent: Math.floor(syncPercent),
                        })}
                        disabled={isSyncing || !isReady}
                        onClick={() => setForceSyncConfirmOpen(true)}
                      >
                        {syncTranslator.t("action.forceUpload")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={CloudUpload}
                        loading={isSyncing}
                        loadingText={syncTranslator.t("progress.syncPercent", {
                          percent: Math.floor(syncPercent),
                        })}
                        disabled={!isReady || isSyncing}
                        onClick={onSyncClick}
                      >
                        {syncTranslator.t("action.uploadCloud")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RefreshCw}
                        loading={isChecking}
                        loadingText={syncTranslator.t("action.checking")}
                        disabled={!isReady || isSyncing}
                        onClick={() => void onCheckUpdate()}
                      >
                        {syncTranslator.t("action.check")}
                      </Button>
                    </>
                  )}
                </SyncActions>
              </Panel>
              {isConfigured ? (
                <ResourceSyncCard
                  model={resourceSync}
                  ready={isReady}
                  onSync={() => {
                    setFileFilter("all");
                    void resourceSync.handleSync();
                  }}
                />
              ) : (
                <Panel
                  pad="none"
                  className="text-tau-meta text-ink-2 grid place-items-center rounded-[14px] px-6 text-center"
                >
                  {syncTranslator.t("resource.serviceHint")}
                </Panel>
              )}
            </div>
          </SettingsGroup>

          {isConfigured && (
            <ResourceSyncFiles
              ready={isReady}
              model={resourceSync}
              filter={fileFilter}
              onFilterChange={setFileFilter}
            />
          )}

          <SettingsGroup
            title={syncTranslator.t("service.title")}
            description={syncTranslator.t("service.description")}
          >
            <ProviderChoiceList
              sections={pluginSections}
              configurations={sync.plugin?.configurations}
              current={sync.plugin?.id ?? ""}
              from="sync"
              disabled={isSyncing || resourceSync.isSyncing || resourceSync.refreshing}
              probing={switcher.probing}
              addLabel={syncTranslator.t("service.add")}
              onSelect={(pluginId, title) => void switcher.request(pluginId, title)}
            />
          </SettingsGroup>
          {switcher.dialog}
        </>
      ) : (
        <LocalDatabasePanel />
      )}

      <ConfirmDialog
        open={downloadConfirmOpen}
        onOpenChange={setDownloadConfirmOpen}
        title={syncTranslator.t("action.downloadUpdate")}
        size="lg"
        context={database.active}
        description={
          syncDirection === "download" ? (
            <ProgressStatus
              value={syncPercent}
              label={syncStatus ? formatDatabaseSyncStatus(syncStatus, locale) : ""}
            />
          ) : (
            syncTranslator.t("download.description", { version: remoteVersion })
          )
        }
        impact={syncTranslator.t("download.backup")}
        confirmText={syncTranslator.t("action.download")}
        confirmDisabled={isSyncing || !isReady}
        loadingText={syncTranslator.t("progress.downloadPercent", {
          percent: Math.floor(syncPercent),
        })}
        onConfirm={onDownload}
      />
      <ConfirmDialog
        open={forceSyncConfirmOpen}
        onOpenChange={setForceSyncConfirmOpen}
        title={syncTranslator.t("action.forceSync")}
        context={database.active}
        danger
        description={syncTranslator.t("overwrite.forceDescription", {
          local: localVersion,
          remote: remoteVersion,
        })}
        impact={syncTranslator.t("overwrite.remoteLoss")}
        confirmText={syncTranslator.t("action.forceSync")}
        confirmDisabled={isSyncing || !isReady}
        onConfirm={doUpload}
      />
    </>
  );
}
