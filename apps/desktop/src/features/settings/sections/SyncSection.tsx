/** 同步操作由客户端负责，存储配置由启用的同步插件提供。 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Database, Download, RefreshCw } from "lucide-react";
import { localDatabaseVersion } from "@tau/db-schema/sync-protocol";
import { Button, ConfirmDialog, Panel, toast } from "@tau/ui";
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

type SyncTab = "overview" | "files" | "database";

export function SyncSection() {
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
    setIsSyncing(true);
    setSyncPercent(0);
    try {
      const ok = await upload({ onProgress: ({ value }) => setSyncPercent(Math.round(value)) });
      if (ok) {
        queryClient.setQueryData(remoteKey, {
          version: localDatabaseVersion(
            useSettingStore
              .getState()
              .setting.database.databases.find(item => item.name === database.active)
          ),
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
    if (isSyncing || !isReady) return;
    if (hasUpdate) {
      setForceSyncConfirmOpen(true);
      return;
    }
    void doUpload();
  };

  const onCheckUpdate = async () => {
    if (!isReady) return;
    setIsChecking(true);
    try {
      const remote = await getRemoteDatabaseVersion();
      const originVersion = remote.version;
      queryClient.setQueryData(remoteKey, remote);
      if (localVersion < originVersion) {
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

  const [tab, setTab] = useState<SyncTab>("overview");
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const resourceSync = useResourceSyncModel();

  const dbChip = !isConfigured ? (
    <StatusChip tone="warn">未配置</StatusChip>
  ) : !isReady ? (
    <StatusChip tone="warn">
      {pluginState === "failed" || pluginState === "restart-required" ? "插件不可用" : "准备中"}
    </StatusChip>
  ) : remoteQuery.isFetching ? (
    <StatusChip tone="accent">检查中</StatusChip>
  ) : remoteQuery.isError ? (
    <StatusChip tone="danger">检查失败</StatusChip>
  ) : !remoteKnown ? (
    <StatusChip>未检查</StatusChip>
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
              <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
                <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
                  <Database size={15} strokeWidth={1.75} className="text-ink-2" />
                  数据库
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
                    <span className="text-tau-meta text-ink-2">在下方选择同步服务后即可同步</span>
                  ) : hasUpdate ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Download}
                        onClick={() => setDownloadConfirmOpen(true)}
                      >
                        拉取远程
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={CloudUpload}
                        loading={isSyncing}
                        loadingText={`上传中 ${syncPercent}%`}
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
                        loadingText={`同步中 ${syncPercent}%`}
                        disabled={!isReady}
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
                        disabled={!isReady}
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

          <SettingsGroup
            title="同步服务"
            description="同一时间只同步到一个服务，数据库与资源文件共用"
          >
            <ProviderChoiceList
              sections={pluginSections}
              configurations={sync.plugin?.configurations}
              current={sync.plugin?.id ?? ""}
              from="sync"
              disabled={isSyncing}
              probing={switcher.probing}
              addLabel="添加同步服务"
              onSelect={(pluginId, title) => void switcher.request(pluginId, title)}
            />
          </SettingsGroup>
          {switcher.dialog}
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
        size="lg"
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
