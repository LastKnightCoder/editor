// 设置模块页：二级模块以独立路由页呈现（settingsModule，match: "params"）。
// 返回逐级退栈、滚动位置保持、转场与侧滑返回全部由 router 的 Activity 保活机制提供，
// 此组件只负责顶栏 chrome 与模块 → section 的映射。
// 数据域两个主页：「同步」是同步中心（数据库 + 资源文件，服务页见 syncProvider 页），
// 「图片与附件」管新插入图片的上传位置（服务页见 uploadProvider 页）。

import { useRef } from "react";
import { AboutSection } from "./about/AboutSection";
import { CollaborationSection } from "./components/CollaborationSection";
import { OverwriteSection } from "./sync/OverwriteSection";
import { ResourceFilesSection } from "./sync/ResourceFilesSection";
import { SyncCenterSection } from "./sync/SyncCenterSection";
import { UploadCenterSection } from "./upload/UploadCenterSection";
import { TtsSettingsSection } from "./tts/TtsSettingsSection";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import { CheckBubble } from "../../components/CheckBubble";
import { GroupCard, GroupNote, GroupRow, IconDatabase } from "./components/ui";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";

function getTitle(module: SettingModuleKey): string {
  switch (module) {
    case "about":
      return "关于与更新";
    case "database":
      return "同步";
    case "databases":
      return "数据库";
    case "sync-overwrite":
      return "整库覆盖";
    case "collaboration":
      return "实时协作";
    case "sync-status-resource":
      return "资源文件";
    case "resource":
      return "图片与附件";
    case "voice":
      return "语音合成";
    default:
      return "设置";
  }
}

type ModuleSectionProps = SettingsPageProps & {
  module: SettingModuleKey;
  onOpenModule: (module: SettingModuleKey) => void;
};

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
          resourceProgress={props.resourceSyncProgress}
          resourceStatusFile={props.resourceSyncStatusFile}
          onResourceSyncRefresh={props.onResourceSyncRefresh}
          onResourceSyncStart={props.onResourceSyncStart}
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
      return (
        <UploadCenterSection
          setting={props.safeSetting}
          updateSetting={props.updateSetting}
          onOpenModule={props.onOpenModule}
        />
      );
    case "voice":
      return <TtsSettingsSection />;
    case "about":
      return <AboutSection />;
    case "collaboration":
      return <CollaborationSection />;
    case "sync-status-resource":
      return (
        <ResourceFilesSection
          progress={props.resourceSyncProgress}
          statusFile={props.resourceSyncStatusFile}
          isSyncing={props.isResourceSyncing}
          onRefresh={props.onResourceSyncRefresh}
          onStart={props.onResourceSyncStart}
          onRetryFailed={props.onResourceSyncRetryFailed}
          onCancel={props.onResourceSyncCancel}
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
        className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
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
