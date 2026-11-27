import { useEffect, useState } from "react";
import { Download, ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import {
  APP_DOWNLOAD_URL,
  type UpgradePromptExplanation,
  type UpgradePromptRequest,
} from "@tau/shared/upgrade-prompt";
import { getVersions, openExternal } from "@/commands";
import { initUpdateListeners, useUpdateStore } from "@/stores/useUpdateStore";
import { useUpgradePromptI18n, type UpgradePromptMessageKey } from "./i18n";

export interface ResolvedUpgradeCopy {
  title: string;
  description: string;
  dataSafety: string;
  explanation: UpgradePromptExplanation | null;
}

/** 按 reason 解析默认文案，调用方显式传入的字段优先。 */
export function useResolvedUpgradeCopy(request: UpgradePromptRequest): ResolvedUpgradeCopy {
  const { t } = useUpgradePromptI18n();
  const reason = request.reason;

  const title = request.title ?? t(`reason.${reason}.title` as UpgradePromptMessageKey);

  const description =
    request.description ??
    (reason === "plugin-min-version" && request.minAppVersion
      ? t("reason.plugin-min-version.descriptionWithVersion", { version: request.minAppVersion })
      : t(`reason.${reason}.description` as UpgradePromptMessageKey));

  const dataSafety = request.dataSafety ?? t(`reason.${reason}.safety` as UpgradePromptMessageKey);

  const explanation: UpgradePromptExplanation | null = (() => {
    if (request.explanation) return request.explanation;
    if (reason === "calendar-timezone-write" || reason === "calendar-timezone-drag") {
      return {
        triggerLabel: t(`reason.${reason}.explainTrigger` as UpgradePromptMessageKey),
        rows: [
          {
            label: t(`reason.${reason}.explainRow1Label` as UpgradePromptMessageKey),
            text: t(`reason.${reason}.explainRow1Text` as UpgradePromptMessageKey),
          },
          {
            label: t(`reason.${reason}.explainRow2Label` as UpgradePromptMessageKey),
            text: t(`reason.${reason}.explainRow2Text` as UpgradePromptMessageKey),
          },
        ],
      };
    }
    return null;
  })();

  return { title, description, dataSafety, explanation };
}

/**
 * 通用升级提示的核心状态钩子：同步当前版本、打开时按需触发静默检查，并派生主按钮语义。
 */
export function useUpgradePromptController({
  active,
  embedded = false,
}: {
  active: boolean;
  embedded?: boolean;
}) {
  const { t } = useUpgradePromptI18n();
  const status = useUpdateStore(s => s.status);
  const storeCurrentVersion = useUpdateStore(s => s.currentVersion);
  const newVersion = useUpdateStore(s => s.newVersion);
  const fallbackUrl = useUpdateStore(s => s.fallbackUrl);
  const progress = useUpdateStore(s => s.progress);
  const errorMessage = useUpdateStore(s => s.errorMessage);
  const releaseNotes = useUpdateStore(s => s.releaseNotes);
  const [detectedVersion, setDetectedVersion] = useState<string | null>(null);

  // 启动阶段尚未挂载 AutoUpdateChecker，embedded 模式自行维护监听并在卸载时清理。
  useEffect(() => {
    if (!embedded) return;
    return initUpdateListeners();
  }, [embedded]);

  useEffect(() => {
    if (!active) return;
    if (!useUpdateStore.getState().currentVersion) {
      void getVersions()
        .then(v => setDetectedVersion(v.app))
        .catch(() => undefined);
    }
    if (useUpdateStore.getState().status === "idle") {
      void useUpdateStore.getState().check({ silent: true });
    }
  }, [active]);

  const currentVersion = storeCurrentVersion ?? detectedVersion;
  const percent = Math.round(progress);
  const downloadTarget = fallbackUrl || APP_DOWNLOAD_URL;

  const triggerPrimary = () => {
    const store = useUpdateStore.getState();
    switch (store.status) {
      case "ready":
        void store.install();
        return;
      case "available":
        void store.download();
        return;
      case "upToDate":
        void openExternal(downloadTarget);
        return;
      case "error":
      case "idle":
        void store.check();
        return;
      default:
        return;
    }
  };

  const primaryButton = (() => {
    switch (status) {
      case "ready":
        return {
          label: t("action.restart"),
          icon: RotateCw,
          loading: false,
          loadingText: undefined,
        };
      case "available":
        return {
          label: t("action.download"),
          icon: Download,
          loading: false,
          loadingText: undefined,
        };
      case "downloading":
        return {
          label: t("action.downloading", { percent }),
          icon: undefined,
          loading: true,
          loadingText: t("action.downloading", { percent }),
        };
      case "checking":
        return {
          label: t("action.checking"),
          icon: undefined,
          loading: true,
          loadingText: t("action.checking"),
        };
      case "upToDate":
        return {
          label: t("action.openWebsite"),
          icon: ExternalLink,
          loading: false,
          loadingText: undefined,
        };
      case "error":
        return {
          label: t("action.retryCheck"),
          icon: RefreshCw,
          loading: false,
          loadingText: undefined,
        };
      default:
        return {
          label: t("action.checkUpdate"),
          icon: RefreshCw,
          loading: false,
          loadingText: undefined,
        };
    }
  })();

  return {
    status,
    currentVersion,
    newVersion,
    fallbackUrl,
    downloadTarget,
    percent,
    errorMessage,
    releaseNotes,
    triggerPrimary,
    primaryButton,
  };
}
