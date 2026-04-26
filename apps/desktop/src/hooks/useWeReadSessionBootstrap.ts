import { useEffect } from "react";
import weReadService from "@/services/weread";
import { ModuleStatus, useModuleStore } from "@/stores/useModuleStore";
import useSettingStore from "@/stores/useSettingStore";

const useWeReadSessionBootstrap = () => {
  const inited = useSettingStore((state) => state.inited);
  const weread = useSettingStore((state) => state.setting.integration.weread);
  const wereadModuleStatus = useModuleStore(
    (state) => state.moduleStates.weread?.status,
  );

  useEffect(() => {
    if (
      !inited ||
      weread.cookies.length === 0 ||
      wereadModuleStatus !== ModuleStatus.READY
    ) {
      return;
    }
    console.info("[WeReadDebug] 启动会话校验", {
      cookies: weread.cookies.length,
      sessionStatus: weread.sessionStatus,
      lastValidatedAt: weread.lastValidatedAt,
      moduleStatus: wereadModuleStatus,
    });
    void weReadService.validateSession();
  }, [inited, weread.cookies.length, wereadModuleStatus]);
};

export default useWeReadSessionBootstrap;
