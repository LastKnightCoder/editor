/**
 * 资源存储 —— 上传目标（图床）与资源目录同步一页两节（域闭环形态）。
 *
 * 上传目标：编辑器内上传直达所选存储（本地 / GitHub / 阿里云 OSS / S3 / WebDAV，
 * Select 切换即生效）；凭据在「集成」子页，本页只配存储定位；上传压缩是全局
 * 开关，本地目标落盘前同样生效。
 * 资源目录同步：本地 resources 目录与云端双向镜像（本地多→上传、云端多→下载、
 * 同名跳过）；远端与凭据跟随「同步」子页的存储配置，与上传目标相互独立；
 * 状态按提供商+配置哈希独立存档，换配置不串台。
 */

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import { produce } from "immer";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CloudOff,
  CloudUpload,
  File as FileIcon,
  Image as ImageIcon,
  Info,
  KeyRound,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@tau/ui/Button";
import { Checkbox, Switch } from "@tau/ui";
import { Dialog } from "@tau/ui/Dialog";
import { Input } from "@tau/ui/Input";
import { Select } from "@tau/ui/Select";
import { toast } from "@tau/ui/Toast";
import { useEdgeFade } from "@tau/ui/hooks";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import { getBucketList } from "@/commands";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import { EGithubCDN, GITHUB_CDN_NONE_VALUE, GithubCDNOptions } from "@/constants/github";
import { isSyncConfigured } from "@/utils/sync";
import useResourceSync from "@/hooks/useResourceSync";
import useResourceSyncBlacklist from "@/hooks/useResourceSyncBlacklist";
import { ResourceSyncStatus } from "@/types";
import type { IResourceSyncProgress, IFileSyncStatus } from "@/types";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SectionTitle } from "../components/SectionTitle";

const PROVIDER_LABELS: Record<EImageBed, string> = {
  [EImageBed.Local]: "本地",
  [EImageBed.Github]: "GitHub",
  [EImageBed.AliOSS]: "阿里云 OSS",
  [EImageBed.S3]: "S3",
  [EImageBed.WebDav]: "WebDAV",
};

/** 资源目录同步的远端跟随 sync.active，标签与同步子页保持同口径 */
const SYNC_PROVIDER_LABELS: Record<ESync, string> = {
  [ESync.AliOSS]: "阿里云 OSS",
  [ESync.S3]: "S3",
  [ESync.WebDav]: "WebDAV",
  [ESync.Github]: "GitHub",
};

const PROGRESS_STATUS_TEXTS: Record<IResourceSyncProgress["status"], string> = {
  idle: "未开始",
  scanning: "扫描资源中",
  syncing: "同步中",
  completed: "已完成",
  error: "出错",
  cancelled: "已取消",
};

const FILE_STATUS_TEXTS: Record<ResourceSyncStatus, string> = {
  [ResourceSyncStatus.Pending]: "待同步",
  [ResourceSyncStatus.Syncing]: "同步中",
  [ResourceSyncStatus.Synced]: "已同步",
  [ResourceSyncStatus.Error]: "失败",
};

const FILE_STATUS_BADGES: Record<ResourceSyncStatus, string> = {
  [ResourceSyncStatus.Synced]: "bg-ok-soft text-ok",
  [ResourceSyncStatus.Pending]: "bg-group text-ink-3",
  [ResourceSyncStatus.Syncing]: "bg-accent-soft text-accent-text",
  [ResourceSyncStatus.Error]: "bg-warn-soft text-warn",
};

/** 展示顺序：失败 → 同步中 → 待同步 → 已同步，同级按文件名序 */
const FILE_STATUS_ORDER: Record<ResourceSyncStatus, number> = {
  [ResourceSyncStatus.Error]: 0,
  [ResourceSyncStatus.Syncing]: 1,
  [ResourceSyncStatus.Pending]: 2,
  [ResourceSyncStatus.Synced]: 3,
};

type FileFilter = "all" | "upload" | "download" | "error";

const FILE_FILTER_LABELS: Record<FileFilter, string> = {
  all: "全部",
  upload: "待上传",
  download: "待下载",
  error: "需重传",
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

const formatSyncTime = (time: number | null | undefined) =>
  time ? dayjs(time).format("MM-DD HH:mm") : "—";

const formatFileSize = (size: number | null | undefined) => {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

export function ResourceSection() {
  const setting = useSettingStore(s => s.setting);
  const { imageBed, sync, integration } = setting;
  const active = imageBed.active;

  /* ── 上传目标：GitHub 仓库/分支、OSS Bucket 列表（凭据就绪自动拉取） ── */
  const githubTokenReady = Boolean(integration.github.token && integration.github.user.name);
  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  useEffect(() => {
    if (active !== EImageBed.Github || !githubTokenReady || repos.length > 0) return;
    let cancelled = false;
    setReposLoading(true);
    void getReposByOwner(integration.github.token, integration.github.user.name).then(list => {
      if (cancelled) return;
      setReposLoading(false);
      if (list) {
        setRepos(list.map((item: { name: string }) => item.name));
      } else {
        toast.error("获取仓库列表失败，请检查集成中的 GitHub Token");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, repos.length]);

  useEffect(() => {
    if (active !== EImageBed.Github || !githubTokenReady) return;
    const repo = imageBed.github.repo;
    if (!repo || branches.length > 0) return;
    let cancelled = false;
    void getBranchesByRepo(integration.github.token, integration.github.user.name, repo).then(
      list => {
        if (!cancelled && list) {
          setBranches(list.map((item: { name: string }) => item.name));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, imageBed.github, branches.length]);

  const [buckets, setBuckets] = useState<Array<{ bucket: string; region: string }>>([]);
  const ossCredentialReady = Boolean(
    integration.aliOSS.accessKeyId && integration.aliOSS.accessKeySecret
  );

  useEffect(() => {
    if (active !== EImageBed.AliOSS || !ossCredentialReady || buckets.length > 0) return;
    let cancelled = false;
    void getBucketList(integration.aliOSS.accessKeyId, integration.aliOSS.accessKeySecret)
      .then(list => {
        if (!cancelled && list) setBuckets(list);
      })
      .catch(() => {
        if (!cancelled) toast.error("获取 Bucket 列表失败，请检查集成中的阿里云凭据");
      });
    return () => {
      cancelled = true;
    };
  }, [active, ossCredentialReady, integration.aliOSS, buckets.length]);

  const updateImageBedField = (field: string, value: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        (draft.imageBed[active] as Record<string, string>)[field] = value;
      }),
    }));
  };

  const setActiveProvider = (provider: EImageBed) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.active = provider;
      }),
    }));
  };

  const setCompression = (checked: boolean) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.enableCompression = checked;
      }),
    }));
  };

  const handleSelectRepo = async (repo: string) => {
    updateImageBedField("repo", repo);
    const list = await getBranchesByRepo(
      integration.github.token,
      integration.github.user.name,
      repo
    );
    if (list) {
      setBranches(list.map((item: { name: string }) => item.name));
    } else {
      toast.error("获取分支列表失败");
    }
  };

  const handleSelectBucket = (bucket: string) => {
    const info = buckets.find(item => item.bucket === bucket);
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.aliOSS.bucket = bucket;
        if (info) draft.imageBed.aliOSS.region = info.region;
      }),
    }));
  };

  /* ── 资源目录同步：远端跟随同步子页（与上传目标独立） ── */
  const isSyncReady = isSyncConfigured(sync.active, sync, integration);
  const {
    progress,
    statusFile,
    startSync,
    retryFailedSync,
    cancelSync,
    refreshStatuses,
    refreshProgress,
  } = useResourceSync();
  const {
    items: blacklist,
    addItems: addBlacklistItems,
    removeItems: removeBlacklistItems,
  } = useResourceSyncBlacklist();

  const isSyncing = progress.status === "syncing" || progress.status === "scanning";

  const entries = useMemo(() => {
    return Object.entries(statusFile?.files ?? {}).sort(([aName, a], [bName, b]) => {
      const orderDiff = FILE_STATUS_ORDER[a.syncStatus] - FILE_STATUS_ORDER[b.syncStatus];
      return orderDiff !== 0 ? orderDiff : aName.localeCompare(bName);
    });
  }, [statusFile]);

  const errorFiles = useMemo(
    () => entries.filter(([, status]) => status.syncStatus === ResourceSyncStatus.Error),
    [entries]
  );

  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [fileListEl, setFileListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(fileListEl);

  const filterCounts = useMemo(() => {
    const counts: Record<FileFilter, number> = {
      all: entries.length,
      upload: 0,
      download: 0,
      error: 0,
    };
    entries.forEach(([, status]) => {
      if (status.syncDirection === "upload" && status.syncStatus !== ResourceSyncStatus.Synced) {
        counts.upload += 1;
      }
      if (status.syncDirection === "download" && status.syncStatus !== ResourceSyncStatus.Synced) {
        counts.download += 1;
      }
      if (status.syncStatus === ResourceSyncStatus.Error) counts.error += 1;
    });
    return counts;
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter(([, status]) => {
        switch (fileFilter) {
          case "upload":
            return (
              status.syncDirection === "upload" && status.syncStatus !== ResourceSyncStatus.Synced
            );
          case "download":
            return (
              status.syncDirection === "download" && status.syncStatus !== ResourceSyncStatus.Synced
            );
          case "error":
            return status.syncStatus === ResourceSyncStatus.Error;
          default:
            return true;
        }
      }),
    [entries, fileFilter]
  );

  const handleSync = async () => {
    const hasFailed = errorFiles.length > 0;
    const res = hasFailed ? await retryFailedSync() : await startSync();
    if (res?.ok) {
      toast.success(hasFailed ? "已重新同步失败的资源文件" : "资源同步已启动");
    } else {
      toast.error(res?.message || "资源同步启动失败");
    }
  };

  const handleCancelSync = async () => {
    const res = await cancelSync();
    if (res?.ok) toast.success("已停止资源同步");
    else toast.error(res?.message || "停止同步失败");
  };

  const handleRefreshSync = async () => {
    await Promise.all([refreshStatuses(), refreshProgress()]);
    toast.success("已刷新资源同步状态");
  };

  const handleRemoveBlacklist = async (fileName: string) => {
    await removeBlacklistItems({ fileNames: [fileName] });
    toast.success(`已移出黑名单：${fileName}`);
  };

  /* 加入黑名单弹层：候选 = 当前状态文件里的文件名，排除已在黑名单的 */
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [selectedBlacklistNames, setSelectedBlacklistNames] = useState<string[]>([]);
  const blacklistNameSet = useMemo(
    () => new Set(blacklist.map(item => item.fileName)),
    [blacklist]
  );
  const blacklistCandidates = useMemo(
    () => entries.map(([name]) => name).filter(name => !blacklistNameSet.has(name)),
    [entries, blacklistNameSet]
  );

  const handleAddBlacklist = async () => {
    if (!selectedBlacklistNames.length) return;
    await addBlacklistItems(selectedBlacklistNames);
    toast.success(`已添加 ${selectedBlacklistNames.length} 个文件到黑名单`);
    setBlacklistOpen(false);
  };

  const openIntegration = () => useSettingsStore.getState().openSettings("integration");
  const openSync = () => useSettingsStore.getState().openSettings("sync");

  const syncPercent =
    progress.totalFiles > 0 ? Math.round((progress.processedFiles / progress.totalFiles) * 100) : 0;

  const repoOptions = repos.length
    ? repos.map(name => ({ value: name, label: name }))
    : imageBed.github.repo
      ? [{ value: imageBed.github.repo, label: imageBed.github.repo }]
      : [];
  const branchOptions = branches.length
    ? branches.map(name => ({ value: name, label: name }))
    : imageBed.github.branch
      ? [{ value: imageBed.github.branch, label: imageBed.github.branch }]
      : [];
  const bucketOptions = buckets.length
    ? buckets.map(item => ({ value: item.bucket, label: item.bucket }))
    : imageBed.aliOSS.bucket
      ? [{ value: imageBed.aliOSS.bucket, label: imageBed.aliOSS.bucket }]
      : [];

  const inputField = (field: string, label: string, placeholder?: string, spanFull = false) => (
    <label key={field} className={clsx("flex min-w-0 flex-col gap-1.5", spanFull && "col-span-2")}>
      <span className="text-tau-meta text-ink-2 font-medium">{label}</span>
      <Input
        value={(imageBed[active] as Record<string, string>)[field] ?? ""}
        placeholder={placeholder}
        onChange={e => updateImageBedField(field, e.target.value)}
      />
    </label>
  );

  const credentialNotes: Partial<Record<EImageBed, { prefix: string; suffix: string }>> = {
    [EImageBed.Github]: {
      prefix: "Token 在",
      suffix: "中配置；仓库与分支列表依赖该凭据。",
    },
    [EImageBed.AliOSS]: {
      prefix: "AccessKey / Secret 在",
      suffix: "中配置；Bucket 列表依赖该凭据。",
    },
    [EImageBed.S3]: {
      prefix: "AccessKey / Secret（含 endpoint / URL 风格）在",
      suffix: "中配置。",
    },
    [EImageBed.WebDav]: {
      prefix: "服务器地址与账号密码在",
      suffix: "中配置。",
    },
  };
  const credentialNote = credentialNotes[active];

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">资源存储</h3>
      <div className="text-tau-tiny text-ink-3 mt-0.5">
        图片与附件的上传去向，以及本地资源目录的云端镜像
      </div>

      <SectionTitle title={`上传目标 · ${PROVIDER_LABELS[active]}`} />
      <SettingRow title="提供商" description="本地 / GitHub / 阿里云 OSS / S3 / WebDAV">
        <Select
          aria-label="上传目标提供商"
          className="w-[168px]"
          value={active}
          options={(Object.keys(PROVIDER_LABELS) as EImageBed[]).map(key => ({
            value: key,
            label: PROVIDER_LABELS[key],
          }))}
          onValueChange={v => setActiveProvider(v as EImageBed)}
        />
      </SettingRow>

      {active === EImageBed.Local && (
        <SettingRow title="存储目录" description="资源保存在当前数据库的 resources 目录，不上传">
          <Input
            value={imageBed.local.path || "resources"}
            readOnly
            className="font-tau-mono w-[220px]"
          />
        </SettingRow>
      )}

      {active === EImageBed.Github && (
        <div className="grid grid-cols-2 gap-x-3 pt-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">仓库</span>
            <Select
              aria-label="GitHub 仓库"
              className="w-full"
              value={imageBed.github.repo}
              placeholder={
                githubTokenReady ? (reposLoading ? "加载中…" : "选择仓库") : "需先配置 Token"
              }
              disabled={!githubTokenReady}
              options={repoOptions}
              onValueChange={v => void handleSelectRepo(v)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">分支</span>
            <Select
              aria-label="GitHub 分支"
              className="w-full"
              value={imageBed.github.branch}
              placeholder={imageBed.github.repo ? "选择分支" : "先选择仓库"}
              disabled={!githubTokenReady || !imageBed.github.repo}
              options={branchOptions}
              onValueChange={v => updateImageBedField("branch", v)}
            />
          </label>
          {inputField("pathPrefix", "路径前缀（可选）", "如：img/")}
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">CDN</span>
            <Select
              aria-label="GitHub CDN"
              className="w-full"
              value={imageBed.github.cdn ?? GITHUB_CDN_NONE_VALUE}
              options={GithubCDNOptions}
              onValueChange={v =>
                useSettingStore.setState(s => ({
                  setting: produce(s.setting, draft => {
                    draft.imageBed.github.cdn =
                      v === GITHUB_CDN_NONE_VALUE ? null : (v as EGithubCDN);
                  }),
                }))
              }
            />
          </label>
        </div>
      )}

      {active === EImageBed.AliOSS && (
        <div className="grid grid-cols-2 gap-x-3 pt-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">Bucket</span>
            <Select
              aria-label="阿里云 OSS Bucket"
              className="w-full"
              value={imageBed.aliOSS.bucket}
              placeholder={
                ossCredentialReady ? "选择 Bucket（自动带出 Region）" : "需先配置 AccessKey"
              }
              disabled={!ossCredentialReady}
              options={bucketOptions}
              onValueChange={handleSelectBucket}
            />
          </label>
          {inputField("region", "Region", "如：oss-cn-hangzhou")}
          {inputField("pathPrefix", "路径前缀（可选）", "如：img/", true)}
        </div>
      )}

      {active === EImageBed.S3 && (
        <div className="grid grid-cols-2 gap-x-3 pt-3">
          {inputField("bucket", "Bucket")}
          {inputField("region", "Region", "如：us-east-1")}
          {inputField("pathPrefix", "路径前缀（可选）", "如：img/", true)}
        </div>
      )}

      {active === EImageBed.WebDav && (
        <div className="grid grid-cols-2 gap-x-3 pt-3">
          {inputField("pathPrefix", "路径前缀（可选）", "如：/resources", true)}
        </div>
      )}

      <SettingRow
        title="上传压缩"
        description={`png / jpeg / jpg ${active === EImageBed.Local ? "落盘前" : "上传时"}自动转 webp 减小体积`}
      >
        <Switch checked={imageBed.enableCompression} onCheckedChange={setCompression} />
      </SettingRow>

      {credentialNote && (
        <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
          <KeyRound size={13} strokeWidth={1.75} className="flex-none" />
          {credentialNote.prefix}
          <button
            type="button"
            className="text-accent-text font-medium hover:underline"
            onClick={openIntegration}
          >
            集成 · {PROVIDER_LABELS[active]}
          </button>
          {credentialNote.suffix}
        </div>
      )}

      <SectionTitle
        title={`资源目录同步 · ${
          isSyncReady ? `跟随同步存储（${SYNC_PROVIDER_LABELS[sync.active]}）` : "未配置"
        }`}
      />

      {!isSyncReady ? (
        <div className="border-line-1 rounded-tau-md mt-3 flex items-center gap-3 border px-4 py-3">
          <span className="bg-warn-soft text-warn grid size-8 shrink-0 place-items-center rounded-full">
            <CloudOff size={15} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-tau-body font-semibold">同步存储未配置</div>
            <div className="text-tau-tiny text-ink-3 mt-0.5">
              在「同步」子页选择提供商并完善存储路径后，即可镜像 resources 目录
            </div>
          </div>
        </div>
      ) : (
        <div className="border-line-1 rounded-tau-md mt-3 border px-4 py-3">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "grid size-8 shrink-0 place-items-center rounded-full",
                isSyncing ? "bg-accent-soft text-accent-text" : "bg-ok-soft text-ok"
              )}
            >
              {isSyncing ? (
                <RefreshCw size={15} strokeWidth={1.75} className="animate-spin" />
              ) : (
                <CloudUpload size={15} strokeWidth={1.75} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-tau-body truncate font-semibold">
                {isSyncing
                  ? `正在同步 resources 目录${progress.status === "scanning" ? "（扫描中）" : ""}`
                  : errorFiles.length > 0
                    ? `同步完成 · ${errorFiles.length} 个文件失败`
                    : `资源目录同步 · ${PROGRESS_STATUS_TEXTS[progress.status]}`}
              </div>
              <div className="text-tau-tiny text-ink-3 mt-0.5 flex items-center gap-2">
                {isSyncing ? (
                  <>
                    <span className="tabular-nums">
                      已处理 {progress.processedFiles} / {progress.totalFiles}
                    </span>
                    {progress.currentFile && (
                      <span className="font-tau-mono min-w-0 truncate">
                        当前 {progress.currentFile}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      最近同步{" "}
                      {statusFile?.lastSyncTime
                        ? dayjs(statusFile.lastSyncTime).format("YYYY-MM-DD HH:mm")
                        : "暂无记录"}
                    </span>
                    {entries.length > 0 && (
                      <span className="tabular-nums">共 {entries.length} 个文件</span>
                    )}
                    {errorFiles.length > 0 && (
                      <span className="bg-warn-soft text-warn flex-none rounded-full px-2 py-px text-[11px] font-semibold">
                        需处理
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {isSyncing && (
            <div className="bg-sunken mt-2.5 h-[5px] overflow-hidden rounded-full">
              <div
                className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-200"
                style={{ width: `${syncPercent}%` }}
              />
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["上传", progress.uploadCount],
                ["下载", progress.downloadCount],
                ["跳过", progress.skippedCount],
                ["失败", progress.errorCount],
              ] as const
            ).map(([label, count]) => (
              <span
                key={label}
                className={clsx(
                  "rounded-full px-2 py-px text-[11px] tabular-nums",
                  label === "失败" && count > 0 ? "bg-warn-soft text-warn" : "bg-group text-ink-2"
                )}
              >
                {label} <b className="font-semibold">{count}</b>
              </span>
            ))}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {isSyncing ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => void handleRefreshSync()}
                >
                  刷新
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={X}
                  onClick={() => void handleCancelSync()}
                >
                  停止
                </Button>
              </>
            ) : (
              <>
                {errorFiles.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={AlertTriangle}
                    onClick={() => setFileFilter("error")}
                  >
                    查看问题 {errorFiles.length}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => void handleRefreshSync()}
                >
                  刷新
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={CloudUpload}
                  onClick={() => void handleSync()}
                >
                  {errorFiles.length > 0 ? "重试失败" : "同步"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
        <Info size={13} strokeWidth={1.75} className="flex-none" />
        {isSyncReady ? (
          <>
            本地多出的文件上传、云端多出的下载，同名即跳过；远端与凭据跟随
            <button
              type="button"
              className="text-accent-text font-medium hover:underline"
              onClick={openSync}
            >
              同步 · {SYNC_PROVIDER_LABELS[sync.active]}
            </button>
            的存储配置。
          </>
        ) : (
          <>上传目标可先选「本地」，资源将保存到本地目录，不影响日后切换。</>
        )}
      </div>

      {isSyncReady && (
        <>
          <SectionTitle title={`文件 · ${entries.length}`} />
          {entries.length === 0 ? (
            <div className="text-tau-tiny text-ink-3 px-0.5 pt-2">
              暂无同步记录，点击「同步」开始镜像 resources 目录。
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 pt-2.5">
                {(Object.keys(FILE_FILTER_LABELS) as FileFilter[]).map(key => (
                  <button
                    key={key}
                    type="button"
                    className={clsx(
                      "rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums",
                      fileFilter === key
                        ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                        : "border-line-1 text-ink-2 hover:border-ink-3"
                    )}
                    onClick={() => setFileFilter(key)}
                  >
                    {FILE_FILTER_LABELS[key]} {filterCounts[key]}
                  </button>
                ))}
                <span className="flex-1" />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Ban}
                  onClick={() => setBlacklistOpen(true)}
                >
                  管理黑名单
                </Button>
              </div>

              {filteredEntries.length === 0 ? (
                <div className="text-tau-tiny text-ink-3 px-0.5 py-4 text-center">
                  当前筛选条件下没有文件
                </div>
              ) : (
                <div
                  ref={setFileListEl}
                  className="edge-fade-scroll -mr-1 mt-2.5 max-h-72 overflow-y-auto overflow-x-hidden pr-1"
                >
                  {filteredEntries.map(([name, status]) => (
                    <FileRow key={name} name={name} status={status} />
                  ))}
                </div>
              )}

              {blacklist.length > 0 && (
                <div className="text-tau-tiny text-ink-3 flex flex-wrap items-center gap-1.5 pt-2.5">
                  <span>黑名单（不同步）：</span>
                  {blacklist.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      title="点击移出黑名单"
                      className="border-line-1 bg-group text-ink-2 hover:text-warn font-tau-mono flex items-center gap-1 rounded-full border py-px pl-2 pr-1.5 text-[10.5px]"
                      onClick={() => void handleRemoveBlacklist(item.fileName)}
                    >
                      {item.fileName}
                      <X size={11} strokeWidth={1.75} className="text-ink-3" />
                    </button>
                  ))}
                  <span className="opacity-70">点击移出</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Dialog
        open={blacklistOpen}
        onOpenChange={setBlacklistOpen}
        onAfterClose={() => setSelectedBlacklistNames([])}
        title="加入黑名单"
        subtitle="黑名单文件不参与资源目录同步，跨配置共用"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBlacklistOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedBlacklistNames.length}
              onClick={() => void handleAddBlacklist()}
            >
              加入 {selectedBlacklistNames.length > 0 ? `(${selectedBlacklistNames.length})` : ""}
            </Button>
          </>
        }
      >
        {blacklistCandidates.length === 0 ? (
          <div className="text-tau-tiny text-ink-3 py-4 text-center">没有可加入的文件记录</div>
        ) : (
          <div className="flex flex-col gap-1">
            {blacklistCandidates.map(name => (
              <label
                key={name}
                className="border-line-2 flex items-center gap-2.5 border-b py-1.5 last:border-b-0"
              >
                <Checkbox
                  checked={selectedBlacklistNames.includes(name)}
                  onChange={e => {
                    setSelectedBlacklistNames(prev =>
                      e.target.checked ? [...prev, name] : prev.filter(item => item !== name)
                    );
                  }}
                />
                <span className="font-tau-mono text-ink-1 min-w-0 flex-1 truncate text-[11.5px]">
                  {name}
                </span>
              </label>
            ))}
          </div>
        )}
      </Dialog>
    </section>
  );
}

function FileRow({ name, status }: { name: string; status: IFileSyncStatus }) {
  const isError = status.syncStatus === ResourceSyncStatus.Error;
  return (
    <div className="border-line-2 flex items-center gap-2.5 border-b py-2 last:border-b-0">
      <span
        className={clsx(
          "grid size-[30px] shrink-0 place-items-center rounded-md",
          isError ? "bg-warn-soft text-warn" : "bg-group text-ink-3"
        )}
      >
        {isError ? (
          <AlertTriangle size={14} strokeWidth={1.75} />
        ) : IMAGE_EXT_RE.test(name) ? (
          <ImageIcon size={14} strokeWidth={1.75} />
        ) : (
          <FileIcon size={14} strokeWidth={1.75} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="text-ink-1 font-tau-mono truncate text-[11.5px]"
          title={`${name} · ${formatFileSize(status.fileSize)}`}
        >
          {name}
        </div>
        {status.errorMessage && (
          <div
            className="text-warn truncate text-[10.5px] leading-normal"
            title={status.errorMessage}
          >
            {status.errorMessage}
          </div>
        )}
      </div>
      {status.syncDirection && (
        <span
          className="text-ink-3 grid place-items-center"
          title={status.syncDirection === "upload" ? "上传" : "下载"}
        >
          {status.syncDirection === "upload" ? (
            <ArrowUp size={13} strokeWidth={1.75} />
          ) : (
            <ArrowDown size={13} strokeWidth={1.75} />
          )}
        </span>
      )}
      <span
        className={clsx(
          "flex-none rounded-full px-2 py-px text-[10.5px] font-semibold",
          FILE_STATUS_BADGES[status.syncStatus]
        )}
      >
        {FILE_STATUS_TEXTS[status.syncStatus]}
      </span>
      <span className="text-ink-3 w-16 flex-none text-right text-[10.5px] tabular-nums">
        {formatSyncTime(status.lastSyncTime)}
      </span>
    </div>
  );
}
