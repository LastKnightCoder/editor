import { useEffect, useRef } from "react";
import { App, Button } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import useSettingTabStore from "@/stores/useSettingTabStore";
import { initUpdateListeners, useUpdateStore } from "@/stores/useUpdateStore";

// 延迟检查，避免与应用启动初始化抢资源
const AUTO_CHECK_DELAY_MS = 5000;

const useAutoUpdateCheck = () => {
  const { notification } = App.useApp();
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

    const openAboutSetting = () => {
      useSettingTabStore.getState().setActiveKey("app");
      useSettingStore.getState().setSettingModalOpen(true);
    };

    notification.info({
      key: "app-update-available",
      message: "发现新版本",
      description: `Tau v${newVersion} 已发布，建议更新到最新版本。`,
      btn: (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            notification.destroy("app-update-available");
            openAboutSetting();
          }}
        >
          前往更新
        </Button>
      ),
      duration: 0,
    });
  }, [status, autoChecked, newVersion, notification]);
};

export default useAutoUpdateCheck;
