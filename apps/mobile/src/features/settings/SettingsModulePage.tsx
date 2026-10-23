// 设置模块页：二级模块以独立路由页呈现（settingsModule，match: "params"）。
// 返回逐级退栈、滚动位置保持、转场与侧滑返回全部由 router 的 Activity 保活机制提供，
// 此组件只负责顶栏 chrome 与模块 → section 的映射。
// 数据域两个主页：「数据库同步」是同步中心（状态 + 主按钮 + 服务抽屉，服务页见 syncProvider 页），
// 「资源与存储」管资源同步与存储目标（单选组 + checkmark，配置下钻子页）。

import { useRef } from "react";
import type { SettingCompat } from "../../types";
import { AboutSection } from "./components/AboutSection";
import { CollaborationSection } from "./components/CollaborationSection";
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
import { ResourceSyncStatusSection, getResourceSyncSummary } from "./components/SyncStatusSections";
import { OverwriteSection } from "./sync/OverwriteSection";
import { SyncCenterSection } from "./sync/SyncCenterSection";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import {
  CheckBubble,
  GroupCard,
  GroupNote,
  GroupRow,
  IconChevronRight,
  IconDatabase,
  IconFolder,
  InfoDotButton,
  LetterTile,
  StatusDot,
} from "./components/ui";
import { GroupLabel } from "../../components/GroupLabel";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";

function getTitle(module: SettingModuleKey): string {
  switch (module) {
    case "about":
      return "关于";
    case "database":
      return "数据库同步";
    case "databases":
      return "数据库";
    case "sync-overwrite":
      return "整库覆盖";
    case "collaboration":
      return "实时协作";
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
    default:
      return "设置";
  }
}

type ModuleSectionProps = SettingsPageProps & {
  module: SettingModuleKey;
  onOpenModule: (module: SettingModuleKey) => void;
};

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

const RESOURCE_TARGETS = [
  {
    key: "local",
    label: "本地",
    module: "resource-local",
    tile: "bg-tag-4-soft text-tag-4",
    icon: "folder" as const,
  },
  {
    key: "github",
    label: "Github",
    module: "resource-github",
    tile: "bg-tag-3-soft text-tag-3",
    icon: "letter" as const,
  },
  {
    key: "aliOSS",
    label: "AliOSS",
    module: "resource-alioss",
    tile: "bg-accent-soft text-accent-text",
    icon: "letter" as const,
  },
  {
    key: "s3",
    label: "S3",
    module: "resource-s3",
    tile: "bg-tag-2-soft text-tag-2",
    icon: "letter" as const,
  },
  {
    key: "webdav",
    label: "WebDAV",
    module: "resource-webdav",
    tile: "bg-tag-1-soft text-tag-1",
    icon: "letter" as const,
  },
] as const;

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

/** 数据库列表：切换当前数据库（低频，从同步中心「更多」进入） */
function DatabasesView(props: ModuleSectionProps) {
  return (
    <div className="page-enter space-y-1">
      <GroupCard>
        {(props.databases?.databases ?? []).map(db => (
          <GroupRow key={db.name} onClick={() => void props.onSwitchDatabase(db.name)}>
            <IconDatabase />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">{db.name}</span>
              <span className="text-ink-3 block text-[11.5px] tabular-nums">
                结构版本 v{db.version}
              </span>
            </span>
            {props.databases?.activeDatabase === db.name && <CheckBubble />}
          </GroupRow>
        ))}
      </GroupCard>
      <GroupNote>切换数据库后应用将重新加载数据，同步也会改为针对新数据库。</GroupNote>
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
            <span className="text-ink-1 block text-[14.5px] font-medium">{resSummary}</span>
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
              <span className="bg-tag-4-soft text-tag-4 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                <IconFolder />
              </span>
            ) : (
              <LetterTile letter={target.label[0]} className={target.tile} />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">{target.label}</span>
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
      <GroupNote className="pb-2">点选切换存储；点 ⓘ 配置凭证与参数。</GroupNote>
    </div>
  );
}

function ModuleSection(props: ModuleSectionProps) {
  switch (props.module) {
    case "database":
      return (
        <SyncCenterSection
          setting={props.safeSetting}
          versions={props.versions}
          isSyncing={props.isSyncing}
          activeDatabase={props.databases?.activeDatabase ?? null}
          onCheckVersions={props.onCheckVersions}
          onSyncUpload={props.onSyncUpload}
          onSyncDownload={props.onSyncDownload}
          onOpenModule={props.onOpenModule}
        />
      );
    case "databases":
      return <DatabasesView {...props} />;
    case "sync-overwrite":
      return (
        <OverwriteSection
          versions={props.versions}
          isSyncing={props.isSyncing}
          onSyncUpload={props.onSyncUpload}
          onSyncDownload={props.onSyncDownload}
        />
      );
    case "resource":
      return <ResourceSettingsView {...props} />;
    case "about":
      return <AboutSection />;
    case "collaboration":
      return <CollaborationSection />;
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
