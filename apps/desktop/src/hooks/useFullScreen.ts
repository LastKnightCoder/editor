import { useEffect, useState } from "react";
import { invoke, off, on } from "@/electron.ts";

const useFullScreen = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      // Web 环境下请求失败按非全屏处理
      invoke<boolean>("get-full-screen-status")
        .then(setIsFullScreen)
        .catch(() => setIsFullScreen(false));
    };
    refresh();
    on("full-screen-change", refresh);
    return () => {
      off("full-screen-change", refresh);
    };
  }, []);

  return isFullScreen;
};

export default useFullScreen;
