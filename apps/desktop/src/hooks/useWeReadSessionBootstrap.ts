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
    void weReadService.validateSession();
  }, [inited, weread.cookies.length, weread.lastCookieTime]);
};

export default useWeReadSessionBootstrap;
