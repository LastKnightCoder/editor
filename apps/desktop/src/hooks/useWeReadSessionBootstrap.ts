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
      !weread.apiKey.trim() ||
      wereadModuleStatus !== ModuleStatus.READY ||
      weread.connectionStatus !== "unknown" ||
      weread.lastValidatedAt !== 0
    ) {
      return;
    }
    console.info("[WeReadDebug] 启动会话校验", {
      apiKeyConfigured: Boolean(weread.apiKey.trim()),
      connectionStatus: weread.connectionStatus,
      lastValidatedAt: weread.lastValidatedAt,
      moduleStatus: wereadModuleStatus,
    });
    void weReadService.validateSession();
  }, [
    inited,
    weread.apiKey,
    weread.connectionStatus,
    weread.lastValidatedAt,
    wereadModuleStatus,
  ]);
};

export default useWeReadSessionBootstrap;
