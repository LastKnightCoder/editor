// 设置模块页：二级模块以独立路由页呈现（settingsModule，match: "params"）。
// 返回逐级退栈、滚动位置保持、转场与侧滑返回全部由 router 的 Activity 保活机制提供，
// 此组件只负责顶栏 chrome 与模块 → section 的映射。
// 数据域拆为两个主页（方案 C 极简分组）：「数据库与同步」管库、库同步与同步服务；
// 「资源与存储」管资源同步与存储目标。主页只做选择（单选组 + checkmark），
// 状态详情、服务配置全部下钻子页；凭证与参数分离，经各配置子页互通。

import { useRef } from "react";
import type { SettingCompat } from "../../types";
import { AboutSection } from "./components/AboutSection";
import {
  IntegrationAliOssSection,
  IntegrationGithubSection,
  IntegrationS3Section,
  IntegrationWebDavSection,
} from "./components/IntegrationSections";
import {
  ResourceAliOssSection,
  ResourceGithubSection,
  ResourceLocalSection,
  ResourceS3Section,
  ResourceWebDavSection,
} from "./components/ResourceSections";
import {
  SyncAliOssSection,
  SyncGithubSection,
  SyncS3Section,
  SyncWebDavSection,
} from "./components/SyncSections";
import {
  DatabaseSyncStatusSection,
  ResourceSyncStatusSection,
  getDatabaseSyncSummary,
  getResourceSyncSummary,
} from "./components/SyncStatusSections";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import {
  CheckBubble,
  GroupCard,
  GroupLabel,
  GroupRow,
  IconChevronRight,
  IconDatabase,
  IconFolder,
  InfoDotButton,
  LetterTile,
  StatusDot,
} from "./components/ui";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";

function getTitle(module: SettingModuleKey): string {
  switch (module) {
    case "sync":
      return "数据与同步";
    case "about":
      return "关于";
    case "database":
      return "数据库与同步";
    case "sync-status-db":
      return "数据库同步";
    case "sync-status-resource":
      return "资源同步";
    case "integration":
      return "集成账号";
    case "integration-github":
      return "Github 账号";
    case "integration-s3":
      return "S3 账号";
    case "integration-webdav":
      return "WebDAV 账号";
    case "integration-alioss":
      return "AliOSS 账号";
    case "resource":
      return "资源与存储";
    case "resource-local":
      return "本地存储";
    case "resource-github":
      return "Github 资源";
    case "resource-alioss":
      return "AliOSS 资源";
    case "resource-s3":
      return "S3 资源";
    case "resource-webdav":
      return "WebDAV 资源";
    case "sync-webdav":
      return "WebDAV 同步";
    case "sync-alioss":
      return "AliOSS 同步";
    case "sync-github":
      return "Github 同步";
    case "sync-s3":
      return "S3 同步";
    default:
      return "设置";
  }
}

type ModuleSectionProps = SettingsPageProps & {
  module: SettingModuleKey;
  onOpenModule: (module: SettingModuleKey) => void;
};

/** 同步服务单选行描述（凭证状态副文本来自集成账号配置） */
function syncCredentialSubtitle(setting: SettingCompat | null, provider: string): string {
  if (!setting) {
    return "未连接凭证";
  }
  if (provider === "github") {
    const github = setting.integration.github;
    return github.token && github.user.name ? `已连接 · ${github.user.name}` : "未连接凭证";
  }
  if (provider === "aliOSS") {
    return setting.integration.aliOSS.accessKeyId ? "已连接" : "未连接凭证";
  }
  if (provider === "s3") {
    return setting.integration.s3.accessKeyId ? "已连接" : "未连接凭证";
  }
  const webdav = setting.integration.webdav;
  return webdav.url && webdav.username ? "已连接" : "未连接凭证";
}

/** 存储目标单选行副文本：显示已配置的关键参数摘要 */
function resourceTargetSubtitle(setting: SettingCompat | null, target: string): string {
  if (!setting) {
    return "未配置";
  }
  const bed = setting.imageBed;
  if (target === "github") {
    const github = bed.github;
    return github.repo
      ? github.branch
        ? `${github.repo} · ${github.branch}`
        : github.repo
      : "未配置";
  }
  if (target === "aliOSS") {
    return bed.aliOSS.bucket || "未配置";
  }
  if (target === "s3") {
    return bed.s3.bucket || "未配置";
  }
  if (target === "webdav") {
    return bed.webdav.pathPrefix || "未配置";
  }
  return bed.local.path || "resources";
}

const SYNC_PROVIDERS = [
  {
    key: "aliOSS",
    label: "AliOSS",
    module: "sync-alioss",
    tile: "bg-apricot-soft text-apricot",
  },
  {
    key: "github",
    label: "Github",
    module: "sync-github",
    tile: "bg-lilac-soft text-lilac",
  },
  {
    key: "webdav",
    label: "WebDAV",
    module: "sync-webdav",
    tile: "bg-sage-soft text-sage",
  },
  {
    key: "s3",
    label: "S3",
    module: "sync-s3",
    tile: "bg-sky-soft text-sky",
  },
] as const;

const RESOURCE_TARGETS = [
  {
    key: "local",
    label: "本地",
    module: "resource-local",
    tile: "bg-butter-soft text-butter",
    icon: "folder" as const,
  },
  {
    key: "github",
    label: "Github",
    module: "resource-github",
    tile: "bg-lilac-soft text-lilac",
    icon: "letter" as const,
  },
  {
    key: "aliOSS",
    label: "AliOSS",
    module: "resource-alioss",
    tile: "bg-apricot-soft text-apricot",
    icon: "letter" as const,
  },
  {
    key: "s3",
    label: "S3",
    module: "resource-s3",
    tile: "bg-sky-soft text-sky",
    icon: "letter" as const,
  },
  {
    key: "webdav",
    label: "WebDAV",
    module: "resource-webdav",
    tile: "bg-sage-soft text-sage",
    icon: "letter" as const,
  },
] as const;

/** 数据库同步状态行的状态点色调 */
function databaseStatusTone(summary: string, syncing: boolean) {
  if (syncing) {
    return "run" as const;
  }
  if (summary === "已同步") {
    return "ok" as const;
  }
  if (summary === "未开始") {
    return "idle" as const;
  }
  return "warn" as const;
}

/** 资源同步状态行的状态点色调 */
function resourceStatusTone(summary: string) {
  if (summary === "已完成") {
    return "ok" as const;
  }
  if (summary.startsWith("同步中")) {
    return "run" as const;
  }
  if (summary === "异常") {
    return "warn" as const;
  }
  return "idle" as const;
}

/** 数据库与同步主页（方案 C）：当前数据库 + 同步状态 + 同步服务 */
function DatabaseSettingsView(props: ModuleSectionProps) {
  const activeSync = props.safeSetting?.sync.active ?? "aliOSS";

  const selectSyncProvider = (target: string) => {
    if (target === activeSync) {
      return;
    }
    props.updateSetting(
      prev => ({
        ...prev,
        sync: { ...prev.sync, active: target },
      }),
      { persist: true }
    );
  };

  const dbSummary = props.isSyncing ? "同步中" : getDatabaseSyncSummary(props.versions);
  const dbTone = databaseStatusTone(dbSummary, props.isSyncing);
  const dbSub = props.versions
    ? `${props.versions.databaseName} · 本地 v${props.versions.localVersion} · 远端 v${props.versions.remoteVersion}`
    : "尚未检查版本";

  return (
    <div className="page-enter space-y-1">
      <GroupLabel>当前数据库</GroupLabel>
      <GroupCard>
        {(props.databases?.databases ?? []).map(db => (
          <GroupRow key={db.name} onClick={() => void props.onSwitchDatabase(db.name)}>
            <IconDatabase />
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[14.5px] font-medium">{db.name}</span>
              <span className="text-ink-3 block text-[11.5px] tabular-nums">
                结构版本 v{db.version}
              </span>
            </span>
            {props.databases?.activeDatabase === db.name && <CheckBubble />}
          </GroupRow>
        ))}
      </GroupCard>
      <p className="text-ink-3 px-[30px] text-[11.5px] leading-relaxed">
        切换数据库后应用将重新加载数据。
      </p>

      <GroupLabel>数据库同步 · {dbSummary}</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("sync-status-db")}>
          <StatusDot tone={dbTone} />
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[14.5px] font-medium">{dbSummary}</span>
            <span className="text-ink-3 block truncate text-[11.5px]">{dbSub}</span>
          </span>
          <span className="text-ink-3">
            <IconChevronRight />
          </span>
        </GroupRow>
      </GroupCard>

      <GroupLabel>同步服务 · 同时仅一个生效</GroupLabel>
      <GroupCard>
        {SYNC_PROVIDERS.map(provider => (
          <GroupRow key={provider.key} onClick={() => selectSyncProvider(provider.key)}>
            <LetterTile letter={provider.label[0]} className={provider.tile} />
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[14.5px] font-medium">{provider.label}</span>
              <span className="text-ink-3 block truncate text-[11.5px]">
                {syncCredentialSubtitle(props.safeSetting, provider.key)}
              </span>
            </span>
            {activeSync === provider.key && <CheckBubble />}
            <InfoDotButton
              onClick={() => props.onOpenModule(provider.module)}
              label={`配置${provider.label}同步`}
            />
          </GroupRow>
        ))}
      </GroupCard>
      <p className="text-ink-3 px-[30px] pb-2 text-[11.5px] leading-relaxed">
        点选切换服务；点 ⓘ 配置凭证与参数。凭证集中管理，与同步参数互不影响。
      </p>
    </div>
  );
}

/** 资源与存储主页（方案 C）：资源同步状态 + 存储目标 */
function ResourceSettingsView(props: ModuleSectionProps) {
  const activeResource = props.safeSetting?.imageBed.active ?? "github";

  const selectResourceTarget = (target: string) => {
    if (target === activeResource) {
      return;
    }
    props.updateSetting(
      prev => ({
        ...prev,
        imageBed: { ...prev.imageBed, active: target },
      }),
      { persist: true }
    );
  };

  const progress = props.resourceSyncProgress;
  const resSummary = props.isResourceSyncing
    ? "同步中"
    : progress
      ? getResourceSyncSummary(progress)
      : "未开始";
  const resTone = resourceStatusTone(resSummary);
  const resSub =
    progress && progress.totalFiles > 0
      ? `${progress.processedFiles}/${progress.totalFiles} 个文件${progress.errorCount > 0 ? ` · ${progress.errorCount} 个失败` : ""}`
      : "尚无同步记录";

  return (
    <div className="page-enter space-y-1">
      <GroupLabel>资源同步 · {resSummary}</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("sync-status-resource")}>
          <StatusDot tone={resTone} />
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[14.5px] font-medium">{resSummary}</span>
            <span className="text-ink-3 block truncate text-[11.5px]">{resSub}</span>
          </span>
          <span className="text-ink-3">
            <IconChevronRight />
          </span>
        </GroupRow>
      </GroupCard>

      <GroupLabel>存储目标 · 图片与附件上传位置</GroupLabel>
      <GroupCard>
        {RESOURCE_TARGETS.map(target => (
          <GroupRow key={target.key} onClick={() => selectResourceTarget(target.key)}>
            {target.icon === "folder" ? (
              <span className="bg-butter-soft text-butter grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                <IconFolder />
              </span>
            ) : (
              <LetterTile letter={target.label[0]} className={target.tile} />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[14.5px] font-medium">{target.label}</span>
              <span className="text-ink-3 block truncate text-[11.5px]">
                {resourceTargetSubtitle(props.safeSetting, target.key)}
              </span>
            </span>
            {activeResource === target.key && <CheckBubble />}
            <InfoDotButton
              onClick={() => props.onOpenModule(target.module)}
              label={`配置${target.label}存储`}
            />
          </GroupRow>
        ))}
      </GroupCard>
      <p className="text-ink-3 px-[30px] pb-2 text-[11.5px] leading-relaxed">
        点选切换存储；点 ⓘ 配置凭证与参数。
      </p>
    </div>
  );
}

function ModuleSection(props: ModuleSectionProps) {
  switch (props.module) {
    case "sync":
    case "database":
      return <DatabaseSettingsView {...props} />;
    case "resource":
      return <ResourceSettingsView {...props} />;
    case "about":
      return <AboutSection />;
    case "sync-status-db":
      return (
        <DatabaseSyncStatusSection
          versions={props.versions}
          isSyncing={props.isSyncing}
          onCheckVersions={props.onCheckVersions}
          onSyncUpload={props.onSyncUpload}
          onSyncDownload={props.onSyncDownload}
        />
      );
    case "sync-status-resource":
      return (
        <ResourceSyncStatusSection
          resourceSyncProgress={props.resourceSyncProgress}
          resourceSyncStatusFile={props.resourceSyncStatusFile}
          isResourceSyncing={props.isResourceSyncing}
          onResourceSyncRefresh={props.onResourceSyncRefresh}
          onResourceSyncStart={props.onResourceSyncStart}
          onResourceSyncRetryFailed={props.onResourceSyncRetryFailed}
          onResourceSyncCancel={props.onResourceSyncCancel}
          updateSetting={props.updateSetting}
          compressionEnabled={props.safeSetting?.imageBed.enableCompression ?? false}
        />
      );
    case "integration-github":
      return (
        <IntegrationGithubSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
        />
      );
    case "integration-s3":
      return (
        <IntegrationS3Section
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
        />
      );
    case "integration-webdav":
      return (
        <IntegrationWebDavSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
        />
      );
    case "integration-alioss":
      return (
        <IntegrationAliOssSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
        />
      );
    case "resource-local":
    case "resource-github":
    case "resource-alioss":
    case "resource-s3":
    case "resource-webdav": {
      const resourceProps = {
        safeSetting: props.safeSetting,
        isSavingSetting: props.isSavingSetting,
        onSaveSetting: props.onSaveSetting,
        updateSetting: props.updateSetting,
        onOpenModule: props.onOpenModule,
      };
      if (props.module === "resource-local") {
        return <ResourceLocalSection {...resourceProps} />;
      }
      if (props.module === "resource-github") {
        return <ResourceGithubSection {...resourceProps} />;
      }
      if (props.module === "resource-alioss") {
        return <ResourceAliOssSection {...resourceProps} />;
      }
      if (props.module === "resource-s3") {
        return <ResourceS3Section {...resourceProps} />;
      }
      return <ResourceWebDavSection {...resourceProps} />;
    }
    case "sync-webdav":
      return (
        <SyncWebDavSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
          onOpenModule={props.onOpenModule}
        />
      );
    case "sync-github":
      return (
        <SyncGithubSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
          onOpenModule={props.onOpenModule}
        />
      );
    case "sync-alioss":
      return (
        <SyncAliOssSection
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
          onOpenModule={props.onOpenModule}
        />
      );
    case "sync-s3":
      return (
        <SyncS3Section
          safeSetting={props.safeSetting}
          isSavingSetting={props.isSavingSetting}
          onSaveSetting={props.onSaveSetting}
          updateSetting={props.updateSetting}
          onOpenModule={props.onOpenModule}
        />
      );
    default:
      return null;
  }
}

export function SettingsModulePage(props: { module: SettingModuleKey }) {
  const navigator = useNavigator();
  const app = useAppContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });

  const openModule = (module: SettingModuleKey) => {
    navigator.push("settingsModule", { module });
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title={getTitle(props.module)} onBack={() => navigator.goBack("ui")} />

      <div
        ref={scrollRef}
        className="edge-fade-scroll mobile-kb-scroll flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: "calc(var(--page-bottom-inset) + var(--kb-height, 0px))" }}
      >
        <ModuleSection
          module={props.module}
          onOpenModule={openModule}
          safeSetting={app.syncSettings.safeSetting}
          databases={app.bootstrap.databases}
          versions={app.bootstrap.versions}
          isSavingSetting={app.syncSettings.isSavingSetting}
          isSyncing={app.syncSettings.isSyncing}
          resourceSyncProgress={app.resourceSync.progress}
          resourceSyncStatusFile={app.resourceSync.statusFile}
          isResourceSyncing={app.resourceSync.isResourceSyncing}
          onSwitchDatabase={app.handleSwitchDatabase}
          onSaveSetting={app.handleSaveSetting}
          onCheckVersions={app.handleCheckVersions}
          onSyncUpload={app.handleSyncUpload}
          onSyncDownload={app.handleSyncDownload}
          onResourceSyncRefresh={app.handleResourceSyncRefresh}
          onResourceSyncStart={app.handleResourceSyncStart}
          onResourceSyncRetryFailed={app.handleResourceSyncRetryFailed}
          onResourceSyncCancel={app.handleResourceSyncCancel}
          updateSetting={app.syncSettings.updateSetting}
        />
      </div>
    </div>
  );
}
