import { useEffect, useRef } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { notify } from "@tau/ui";
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

  notify({
    id: UPGRADED_NOTICE_ID,
    title: `已更新到 v${change.currentVersion}`,
    body: "看看这次更新带来了哪些变化。",
    source: "应用更新",
    icon: Sparkles,
    sticky: true,
    actions: [
      { label: "稍后" },
      {
        label: "查看更新内容",
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
    notify({
      id: NOTICE_ID,
      title: `新版本 v${newVersion} 已就绪`,
      body: `已在后台下载完成，随时可以更新到 v${newVersion}。`,
      source: "应用更新",
      icon: RotateCw,
      sticky: true,
      actions: [
        releaseNotes.length > 0
          ? {
              label: "查看更新内容",
              onClick: () =>
                useReleaseNotesStore.getState().show(releaseNotes, { updateAction: true }),
            }
          : { label: "稍后" },
        {
          label: "立即更新",
          primary: true,
          onClick: () => void useUpdateStore.getState().install(),
        },
      ],
    });
  }, [status, autoChecked, newVersion]);
};

export default useAutoUpdateCheck;
