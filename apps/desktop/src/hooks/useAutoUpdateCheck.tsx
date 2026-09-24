import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { notify } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useSettingsStore } from "@/app/settingsStore";
import { initUpdateListeners, useUpdateStore } from "@/stores/useUpdateStore";

// 延迟检查，避免与应用启动初始化抢资源
const AUTO_CHECK_DELAY_MS = 5000;
const NOTICE_ID = "app-update-available";

const useAutoUpdateCheck = () => {
  const notifiedRef = useRef(false);

  const status = useUpdateStore(state => state.status);
  const autoChecked = useUpdateStore(state => state.autoChecked);
  const newVersion = useUpdateStore(state => state.newVersion);

  useEffect(() => initUpdateListeners(), []);

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
    if (status !== "available" || !autoChecked || !newVersion) return;
    if (notifiedRef.current) return;
    notifiedRef.current = true;

    notify({
      id: NOTICE_ID,
      title: `发现新版本 v${newVersion}`,
      body: `Tau v${newVersion} 已发布，建议更新到最新版本。`,
      source: "应用更新",
      icon: Download,
      sticky: true,
      actions: [
        { label: "稍后" },
        {
          label: "前往更新",
          primary: true,
          onClick: () => useSettingsStore.getState().openSettings("app"),
        },
      ],
    });
  }, [status, autoChecked, newVersion]);
};

export default useAutoUpdateCheck;
