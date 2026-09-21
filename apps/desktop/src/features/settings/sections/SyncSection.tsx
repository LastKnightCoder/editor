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
 * - legacy 的资源文件级同步管理（列表/状态/黑名单）不在本版范围
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudOff, CloudUpload, Download, KeyRound, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { produce } from "immer";
import { Button } from "@tau/ui/Button";
import { ConfirmDialog } from "@tau/ui/ConfirmDialog";
import { Input } from "@tau/ui/Input";
import { Select } from "@tau/ui/Select";
import { toast } from "@tau/ui/Toast";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { download, getOriginDatabaseInfo, upload } from "@/commands";
import { isSyncConfigured } from "@/utils/sync";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SectionTitle } from "../components/SectionTitle";

const PROVIDER_LABELS: Record<ESync, string> = {
  [ESync.AliOSS]: "阿里云 OSS",
  [ESync.S3]: "S3",
  [ESync.WebDav]: "WebDAV",
  [ESync.Github]: "GitHub",
};

/** 各家存储定位字段（本页只写 sync 域；凭据在集成子页） */
const PROVIDER_FIELDS: Record<
  ESync,
  Array<{ key: string; label: string; placeholder?: string }>
> = {
  [ESync.AliOSS]: [
    { key: "bucket", label: "Bucket" },
    { key: "region", label: "Region" },
    { key: "path", label: "路径", placeholder: "留空表示根目录，如：/sync/" },
  ],
  [ESync.S3]: [
    { key: "bucket", label: "Bucket" },
    { key: "region", label: "Region", placeholder: "如：us-east-1" },
    { key: "pathPrefix", label: "路径前缀", placeholder: "如：sync/（可选）" },
  ],
  [ESync.WebDav]: [{ key: "pathPrefix", label: "路径前缀", placeholder: "如：/sync（可选）" }],
  [ESync.Github]: [
    { key: "repo", label: "仓库" },
    { key: "branch", label: "分支" },
    { key: "pathPrefix", label: "路径前缀", placeholder: "如：sync/（可选）" },
  ],
};

export function SyncSection() {
  const queryClient = useQueryClient();
  const setting = useSettingStore(s => s.setting);
  const { sync, integration, database } = setting;
  const active = sync.active;

  const [isSyncing, setIsSyncing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false);
  const [forceSyncConfirmOpen, setForceSyncConfirmOpen] = useState(false);

  const activeDatabase = database.databases.find(item => item.name === database.active);
  const localVersion = activeDatabase?.version ?? 0;
  const isConfigured = isSyncConfigured(active, sync, integration);

  /* 远程版本：网络查询，配置就绪才拉；检查更新 refetch，同步/下载后手动更新 */
  const remoteQuery = useQuery({
    queryKey: ["settings", "sync", "remote-version"],
    queryFn: async () => {
      const info = await getOriginDatabaseInfo();
      return Number((info?.databaseInfo as { version?: number } | undefined)?.version) || 0;
    },
    enabled: isConfigured,
    staleTime: Infinity,
    retry: false,
  });
  const remoteKnown = isConfigured && remoteQuery.data !== undefined;
  const remoteVersion = remoteKnown ? remoteQuery.data : 0;
  const hasUpdate = remoteKnown && remoteVersion > localVersion;

  const doUpload = async () => {
    setIsSyncing(true);
    try {
      const ok = await upload();
      if (ok) {
        queryClient.setQueryData(["settings", "sync", "remote-version"], localVersion + 1);
        toast.success("同步成功");
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
      const originVersion =
        Number((info?.databaseInfo as { version?: number } | undefined)?.version) || 0;
      queryClient.setQueryData(["settings", "sync", "remote-version"], originVersion);
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
        queryClient.setQueryData(["settings", "sync", "remote-version"], localVersion);
        toast.success("更新成功，已刷新数据库，原文件已备份至 backup 文件夹");
      } else {
        toast.error("下载失败");
      }
    } catch (error) {
      toast.error(`下载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateSyncField = (field: string, value: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        // ESync 键名与 sync 域字段一一对应（aliOSS/s3/webdav/github）
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

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">同步</h3>

      {/* 状态卡：左侧两行信息（主文案 / 版本+徽标）、右侧按钮组垂直居中，互不挤压 */}
      <div className="border-line-1 rounded-tau-md mt-3 flex items-center gap-3 border px-4 py-3">
        <span
          className={clsx(
            "grid size-8 shrink-0 place-items-center rounded-full",
            isConfigured ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
          )}
        >
          {isConfigured ? (
            <CloudUpload size={15} strokeWidth={1.75} />
          ) : (
            <CloudOff size={15} strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-tau-body truncate font-semibold">
            {isConfigured ? `${PROVIDER_LABELS[active]} 已连接` : "尚未配置同步"}
          </div>
          <div className="text-tau-tiny mt-0.5 flex items-center gap-2">
            {isConfigured ? (
              <>
                <span className="text-ink-3 tabular-nums">本地 v{localVersion}</span>
                <span
                  className={clsx(
                    "tabular-nums",
                    hasUpdate ? "text-accent-text font-medium" : "text-ink-3"
                  )}
                >
                  远程 {remoteKnown ? `v${remoteVersion}` : "未检查"}
                </span>
                {remoteKnown &&
                  (hasUpdate ? (
                    <span className="bg-accent-soft text-accent-text flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                      有新版本
                    </span>
                  ) : (
                    <span className="bg-ok-soft text-ok flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                      已是最新
                    </span>
                  ))}
              </>
            ) : (
              <span className="text-ink-3 truncate">选择提供商并完善存储路径后即可同步</span>
            )}
          </div>
        </div>
        {isConfigured && (
          <div className="flex flex-none gap-2">
            {hasUpdate ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CloudUpload}
                  loading={isSyncing}
                  onClick={() => setForceSyncConfirmOpen(true)}
                >
                  强制同步
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Download}
                  onClick={() => setDownloadConfirmOpen(true)}
                >
                  下载更新
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  loading={isChecking}
                  loadingText="检查中…"
                  onClick={() => void onCheckUpdate()}
                >
                  检查更新
                </Button>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* 存储区：提供商 + 各家字段（凭据在集成子页） */}
      <SectionTitle title={`存储 · ${PROVIDER_LABELS[active]}`} />
      <SettingRow title="提供商" description="阿里云 OSS / S3 / WebDAV / GitHub">
        <Select
          aria-label="同步提供商"
          className="w-[168px]"
          value={active}
          options={(Object.keys(PROVIDER_LABELS) as ESync[]).map(key => ({
            value: key,
            label: PROVIDER_LABELS[key],
          }))}
          onValueChange={v => setActiveProvider(v as ESync)}
        />
      </SettingRow>
      <div className="grid grid-cols-2 gap-x-3 pt-3">
        {PROVIDER_FIELDS[active].map((field, index) => (
          <label
            key={field.key}
            className={clsx(
              "flex min-w-0 flex-col gap-1.5",
              PROVIDER_FIELDS[active].length === 1 ||
                (index === PROVIDER_FIELDS[active].length - 1 &&
                  PROVIDER_FIELDS[active].length % 2 === 1)
                ? "col-span-2"
                : "col-span-1"
            )}
          >
            <span className="text-tau-meta text-ink-2 font-medium">{field.label}</span>
            <Input
              value={(sync[active] as Record<string, string>)[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={e => updateSyncField(field.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
        <KeyRound size={13} strokeWidth={1.75} className="flex-none" />
        服务器地址与账号密钥在
        <button
          type="button"
          className="text-accent-text font-medium hover:underline"
          onClick={() => useSettingsStore.getState().openSettings("integration")}
        >
          集成 · {PROVIDER_LABELS[active]}
        </button>
        中配置。
      </div>

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
    </section>
  );
}
