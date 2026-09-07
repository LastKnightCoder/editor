import { useEffect, useState } from "react";
import { AboutSection } from "./components/AboutSection";
import {
  AIEmbeddingApiSection,
  AIHomeSection,
  AILlmConfigsSection,
  AILlmUsageSection,
} from "./components/AISections";
import { DatabaseSection } from "./components/DatabaseSection";
import {
  IntegrationAliOssSection,
  IntegrationGithubSection,
  IntegrationHomeSection,
  IntegrationS3Section,
  IntegrationWebDavSection,
} from "./components/IntegrationSections";
import { OverviewSection } from "./components/OverviewSection";
import {
  ResourceAliOssSection,
  ResourceGithubSection,
  ResourceHomeSection,
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
} from "./components/SyncStatusSections";
import { ThemeSection } from "./components/ThemeSection";
import type { SettingModule, SettingsPageProps } from "./components/types";
import { IconChevronLeft } from "./components/ui";
import { motion, useReducedMotion } from "motion/react";
import { resolveScreenMotion } from "../../navigation/screenTransition";
import type { PageTransitionConfig } from "../../navigation/types";

type SettingsScreenProps = SettingsPageProps & {
  transition?: PageTransitionConfig;
};

function getTitle(activeModule: SettingModule): string {
  switch (activeModule) {
    case "ai":
      return "AI 模型";
    case "ai-llm-configs":
      return "LLM 配置";
    case "ai-llm-usage":
      return "功能模型分配";
    case "ai-embedding-api":
      return "Embedding API";
    case "theme":
      return "外观";
    case "about":
      return "关于";
    case "database":
      return "数据库管理";
    case "sync-status-db":
      return "数据库同步状态";
    case "sync-status-resource":
      return "资源同步状态";
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
      return "资源存储";
    case "resource-local":
      return "本地资源配置";
    case "resource-github":
      return "Github 资源配置";
    case "resource-alioss":
      return "AliOSS 资源配置";
    case "resource-s3":
      return "S3 资源配置";
    case "resource-webdav":
      return "WebDAV 资源配置";
    case "sync-webdav":
      return "WebDAV 同步配置";
    case "sync-alioss":
      return "AliOSS 同步配置";
    case "sync-github":
      return "Github 同步配置";
    case "sync-s3":
      return "S3 同步配置";
    default:
      return "设置";
  }
}

function SettingsContent(
  props: SettingsPageProps & {
    activeModule: SettingModule;
    setActiveModule: (module: SettingModule) => void;
    isDark: boolean;
    setIsDark: (dark: boolean) => void;
  }
) {
  const activeSync = props.safeSetting?.sync.active ?? "aliOSS";
  const activeResource = props.safeSetting?.imageBed.active ?? "github";
  const compressionEnabled = props.safeSetting?.imageBed.enableCompression ?? false;

  if (!props.activeModule) {
    return (
      <OverviewSection
        isDark={props.isDark}
        activeSync={activeSync}
        activeResource={activeResource}
        versions={props.versions}
        activeDatabase={props.databases?.activeDatabase}
        onOpenModule={module => props.setActiveModule(module)}
        resourceSyncProgress={props.resourceSyncProgress}
      />
    );
  }

  if (props.activeModule === "theme") {
    return <ThemeSection isDark={props.isDark} setIsDark={props.setIsDark} />;
  }

  if (props.activeModule === "ai") {
    return <AIHomeSection onOpenModule={module => props.setActiveModule(module)} />;
  }

  if (props.activeModule === "ai-llm-configs") {
    return (
      <AILlmConfigsSection safeSetting={props.safeSetting} updateSetting={props.updateSetting} />
    );
  }

  if (props.activeModule === "ai-llm-usage") {
    return (
      <AILlmUsageSection safeSetting={props.safeSetting} updateSetting={props.updateSetting} />
    );
  }

  if (props.activeModule === "ai-embedding-api") {
    return (
      <AIEmbeddingApiSection safeSetting={props.safeSetting} updateSetting={props.updateSetting} />
    );
  }

  if (props.activeModule === "about") {
    return <AboutSection />;
  }

  if (props.activeModule === "database") {
    return (
      <DatabaseSection databases={props.databases} onSwitchDatabase={props.onSwitchDatabase} />
    );
  }

  if (props.activeModule === "sync-status-db") {
    return (
      <DatabaseSyncStatusSection
        versions={props.versions}
        isSyncing={props.isSyncing}
        onCheckVersions={props.onCheckVersions}
        onSyncUpload={props.onSyncUpload}
        onSyncDownload={props.onSyncDownload}
      />
    );
  }

  if (props.activeModule === "sync-status-resource") {
    return (
      <ResourceSyncStatusSection
        resourceSyncProgress={props.resourceSyncProgress}
        resourceSyncStatusFile={props.resourceSyncStatusFile}
        isResourceSyncing={props.isResourceSyncing}
        onResourceSyncRefresh={props.onResourceSyncRefresh}
        onResourceSyncStart={props.onResourceSyncStart}
        onResourceSyncRetryFailed={props.onResourceSyncRetryFailed}
        onResourceSyncCancel={props.onResourceSyncCancel}
      />
    );
  }

  if (props.activeModule === "integration") {
    return <IntegrationHomeSection onOpenModule={module => props.setActiveModule(module)} />;
  }

  if (props.activeModule === "integration-github") {
    return (
      <IntegrationGithubSection
        safeSetting={props.safeSetting}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "integration-s3") {
    return (
      <IntegrationS3Section
        safeSetting={props.safeSetting}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "integration-webdav") {
    return (
      <IntegrationWebDavSection
        safeSetting={props.safeSetting}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "integration-alioss") {
    return (
      <IntegrationAliOssSection
        safeSetting={props.safeSetting}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource") {
    return (
      <ResourceHomeSection
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        compressionEnabled={compressionEnabled}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        onOpenModule={module => props.setActiveModule(module)}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource-local") {
    return (
      <ResourceLocalSection
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource-github") {
    return (
      <ResourceGithubSection
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource-alioss") {
    return (
      <ResourceAliOssSection
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource-s3") {
    return (
      <ResourceS3Section
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "resource-webdav") {
    return (
      <ResourceWebDavSection
        safeSetting={props.safeSetting}
        activeResource={activeResource}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "sync-webdav") {
    return (
      <SyncWebDavSection
        safeSetting={props.safeSetting}
        activeSync={activeSync}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "sync-github") {
    return (
      <SyncGithubSection
        safeSetting={props.safeSetting}
        activeSync={activeSync}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  if (props.activeModule === "sync-s3") {
    return (
      <SyncS3Section
        safeSetting={props.safeSetting}
        activeSync={activeSync}
        isSavingSetting={props.isSavingSetting}
        onSaveSetting={props.onSaveSetting}
        updateSetting={props.updateSetting}
      />
    );
  }

  return (
    <SyncAliOssSection
      safeSetting={props.safeSetting}
      activeSync={activeSync}
      isSavingSetting={props.isSavingSetting}
      onSaveSetting={props.onSaveSetting}
      updateSetting={props.updateSetting}
    />
  );
}

export function SettingsPage({ transition, ...props }: SettingsScreenProps) {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains("dark");
  });
  const reducedMotion = useReducedMotion();
  const motionProps = resolveScreenMotion(transition, reducedMotion === true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("tau-mobile-theme", isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [isDark]);

  const handleBack = () => {
    props.onBack();
  };

  return (
    <motion.div
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
    >
      <header className="mobile-topbar topbar-immersive flex items-center px-2">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          <IconChevronLeft />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
          {getTitle(props.activeModule)}
        </h1>
        <div className="w-10" />
      </header>

      <div className="mobile-kb-scroll flex-1 overflow-y-auto p-4">
        <SettingsContent
          {...props}
          activeModule={props.activeModule}
          setActiveModule={props.onActiveModuleChange}
          isDark={isDark}
          setIsDark={setIsDark}
        />
      </div>
    </motion.div>
  );
}
