import { useEffect } from "react";
import weReadService from "@/services/weread";
import { ensureModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";

const useWeReadSessionBootstrap = () => {
  const inited = useSettingStore(state => state.inited);
  const weread = useSettingStore(state => state.setting.integration.weread);

  useEffect(() => {
    if (
      !inited ||
      !weread.apiKey.trim() ||
      weread.connectionStatus !== "unknown" ||
      weread.lastValidatedAt !== 0
    ) {
      return;
    }
    // 原先以 useModuleStore 的模块状态为门槛，但该镜像只由旧主界面的初始化流程刷新，
    // 新壳层不填充它——这里直接确保模块就绪，不再依赖窗口入口
    void ensureModule("weread")
      .then(() => {
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
  }, [inited, weread.apiKey, weread.connectionStatus, weread.lastValidatedAt]);
};

export default useWeReadSessionBootstrap;
