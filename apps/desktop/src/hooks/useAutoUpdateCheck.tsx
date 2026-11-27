import { aboutTranslator } from "../features/settings/about/i18n";
import { useEffect, useRef } from "react";
import { appNotify } from "@/services/notifications/notify";
import useSettingStore from "@/stores/useSettingStore";
import { initUpdateListeners, useUpdateStore } from "@/stores/useUpdateStore";
import { takeVersionChange } from "@/commands/updater";
import { bundledNotesBetween } from "@/features/release-notes/notes";
import { useReleaseNotesStore } from "@/features/release-notes/releaseNotesStore";

// 延迟检查，避免与应用启动初始化抢资源
const AUTO_CHECK_DELAY_MS = 5000;
const UPGRADED_NOTICE_DELAY_MS = 2000;
const NOTICE_ID = "app-update-available";
const UPGRADED_NOTICE_ID = "app-upgraded";

/** 升级后首次启动：展示跨越版本的内置公告 */
async function notifyIfUpgraded() {
  let change;
  try {
    change = await takeVersionChange();
  } catch {
    return; // 非 Electron 运行时或主进程未就绪：不提示
  }
  if (change.previousVersion === null) return;
  const notes = bundledNotesBetween(change.previousVersion || null, change.currentVersion);
  if (notes.length === 0) return;

  appNotify({
    id: UPGRADED_NOTICE_ID,
    title: aboutTranslator.t("notice.upgradedTitle", { version: change.currentVersion }),
    body: aboutTranslator.t("notice.upgradedBody"),
    source: aboutTranslator.t("notice.source"),
    icon: "sparkles",
    sticky: true,
    actions: [
      { label: aboutTranslator.t("action.later") },
      {
        label: aboutTranslator.t("notice.view"),
        reveal: true,
        primary: true,
        onClick: () => useReleaseNotesStore.getState().show(notes),
      },
    ],
  });
}

const useAutoUpdateCheck = () => {
  const notifiedRef = useRef(false);

  const status = useUpdateStore(state => state.status);
  const autoChecked = useUpdateStore(state => state.autoChecked);
  const newVersion = useUpdateStore(state => state.newVersion);

  useEffect(() => initUpdateListeners(), []);

  useEffect(() => {
    const timer = setTimeout(() => void notifyIfUpgraded(), UPGRADED_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const { setting } = useSettingStore.getState();
      if (!setting.misc.update.autoCheck) return;
      if (useUpdateStore.getState().status !== "idle") return;
      void useUpdateStore.getState().check({ silent: true });
    }, AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // 下载完成（ready）才通知：新版本在启动静默检查后已自动后台下载，
    // 用户点「立即更新」时直接重启安装，无需经历等待下载的过程
    if (status !== "ready" || !autoChecked || !newVersion) return;
    if (notifiedRef.current) return;
    notifiedRef.current = true;

    const { releaseNotes } = useUpdateStore.getState();
    appNotify({
      id: NOTICE_ID,
      title: aboutTranslator.t("notice.readyTitle", { version: newVersion }),
      body: aboutTranslator.t("notice.readyBody", { version: newVersion }),
      source: aboutTranslator.t("notice.source"),
      icon: "rotateCw",
      sticky: true,
      actions: [
        releaseNotes.length > 0
          ? {
              label: aboutTranslator.t("notice.view"),
              reveal: true,
              onClick: () =>
                useReleaseNotesStore.getState().show(releaseNotes, { updateAction: true }),
            }
          : { label: aboutTranslator.t("action.later") },
        {
          label: aboutTranslator.t("action.update"),
          primary: true,
          onClick: () => void useUpdateStore.getState().install(),
        },
      ],
    });
  }, [status, autoChecked, newVersion]);
};

export default useAutoUpdateCheck;
