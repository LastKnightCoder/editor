import { useEffect } from "react";
import weReadService from "@/services/weread";
import useSettingStore from "@/stores/useSettingStore";

const useWeReadSessionBootstrap = () => {
  const inited = useSettingStore((state) => state.inited);
  const weread = useSettingStore((state) => state.setting.integration.weread);

  useEffect(() => {
    if (!inited || weread.cookies.length === 0) {
      return;
    }
    console.info("[WeReadDebug] 启动会话校验", {
      cookies: weread.cookies.length,
      sessionStatus: weread.sessionStatus,
      lastValidatedAt: weread.lastValidatedAt,
    });
    void weReadService.validateSession();
  }, [inited, weread.cookies.length]);
};

export default useWeReadSessionBootstrap;
