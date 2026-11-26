import { settingsShellTranslator, useSettingsShellI18n } from "./shell.i18n";
// 设置模块页：二级模块以独立路由页呈现（settingsModule，match: "params"）。
// 返回逐级退栈、滚动位置保持、转场与侧滑返回全部由 router 的 Activity 保活机制提供，
// 此组件只负责顶栏 chrome 与模块 → section 的映射。
// 数据域两个主页：「同步」是同步中心（数据库 + 资源文件，服务页见 syncProvider 页），
// 「图片与附件」管新插入图片的上传位置（服务页见 uploadProvider 页）。

import { useRef } from "react";
import { AboutSection } from "./about/AboutSection";
import { FeedbackSection } from "./feedback/FeedbackSection";
import { NotificationsSection } from "../reminders/NotificationsSection";
import { CollaborationSection } from "./components/CollaborationSection";
import { OverwriteSection } from "./sync/OverwriteSection";
import { ResourceFilesSection } from "./sync/ResourceFilesSection";
import { SyncCenterSection } from "./sync/SyncCenterSection";
import { UploadCenterSection } from "./upload/UploadCenterSection";
import { TtsSettingsSection } from "./tts/TtsSettingsSection";
import { SpeechInputSection } from "./speech/SpeechInputSection";
import { AiModelsSection } from "./ai/AiModelsSection";
import { ImageGenerationSection } from "./images/ImageGenerationSection";
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
      return settingsShellTranslator.t("module.about");
    case "database":
      return settingsShellTranslator.t("module.database");
    case "databases":
      return settingsShellTranslator.t("module.databases");
    case "sync-overwrite":
      return settingsShellTranslator.t("module.sync-overwrite");
    case "collaboration":
      return settingsShellTranslator.t("module.collaboration");
    case "sync-status-resource":
      return settingsShellTranslator.t("module.sync-status-resource");
    case "resource":
      return settingsShellTranslator.t("module.resource");
    case "voice":
      return settingsShellTranslator.t("module.voice");
    case "speech-input":
      return settingsShellTranslator.t("module.speech-input");
    case "ai-models":
      return settingsShellTranslator.t("module.ai-models");
    case "image-generation":
      return settingsShellTranslator.t("module.image-generation");
    case "feedback":
      return settingsShellTranslator.t("module.feedback");
    case "notifications":
      return settingsShellTranslator.t("module.notifications");
    default:
      return settingsShellTranslator.t("settings");
  }
}

type ModuleSectionProps = SettingsPageProps & {
  module: SettingModuleKey;
  onOpenModule: (module: SettingModuleKey) => void;
};

/** 数据库列表：切换当前数据库（低频，从同步中心「更多」进入） */
function DatabasesView(props: ModuleSectionProps) {
  const { t, locale } = useSettingsShellI18n();
  return (
    <div className="page-enter space-y-1">
      <GroupCard>
        {(props.databases?.databases ?? []).map(db => (
          <GroupRow key={db.name} onClick={() => void props.onSwitchDatabase(db.name)}>
            <IconDatabase />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[14.5px] font-medium">{db.name}</span>
              <span className="text-ink-3 block text-[11.5px] tabular-nums">
                {t("database.version", { version: db.version.toLocaleString(locale) })}
              </span>
            </span>
            {props.databases?.activeDatabase === db.name && <CheckBubble />}
          </GroupRow>
        ))}
      </GroupCard>
      <GroupNote>{t("database.switchHint")}</GroupNote>
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
          syncProgress={props.syncProgress}
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
          syncProgress={props.syncProgress}
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
    case "speech-input":
      return <SpeechInputSection />;
    case "ai-models":
      return <AiModelsSection />;
    case "image-generation":
      return <ImageGenerationSection />;
    case "about":
      return <AboutSection />;
    case "feedback":
      return <FeedbackSection />;
    case "notifications":
      return <NotificationsSection />;
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
  useSettingsShellI18n();
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
          syncProgress={app.syncSettings.syncProgress}
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
