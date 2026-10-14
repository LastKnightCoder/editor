import { useEffect } from "react";
import weReadService from "@/services/weread";
import { ensureModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";
import { isMainWindow } from "@/utils/window-role";

const useWeReadSessionBootstrap = () => {
  const inited = useSettingStore(state => state.inited);
  const weread = useSettingStore(state => state.setting.integration.weread);

  useEffect(() => {
    if (
      !isMainWindow() ||
      !inited ||
      !weread.apiKey.trim() ||
      weread.connectionStatus !== "unknown" ||
      weread.lastValidatedAt !== 0
    ) {
      return;
    }
    let cancelled = false;
    void ensureModule("weread")
      .then(() => {
        if (cancelled) return;
        console.info("[WeReadDebug] 启动会话校验", {
          apiKeyConfigured: Boolean(weread.apiKey.trim()),
          connectionStatus: weread.connectionStatus,
          lastValidatedAt: weread.lastValidatedAt,
        });
        return weReadService.validateSession();
      })
      .catch((error: unknown) => {
        console.error("[WeRead] weread 模块初始化失败，跳过会话校验：", error);
      });
    return () => {
      cancelled = true;
    };
  }, [inited, weread.apiKey, weread.connectionStatus, weread.lastValidatedAt]);
};

export default useWeReadSessionBootstrap;
