import { useEffect, useLayoutEffect, useRef } from "react";
import { usePage } from "@/page/PageProvider";
import { bindPageNavigation } from "@/services/page-navigation";
import { listenMainWindowRequests } from "@/services/main-window-requests";

export function PageNavigationBridge() {
  const { navigator, state } = usePage();
  const current = useRef({ navigator, state });
  useLayoutEffect(() => {
    current.current = { navigator, state };
  }, [navigator, state]);
  useLayoutEffect(() => bindPageNavigation(() => current.current), []);
  // 辅助窗口（番茄小窗、编辑窗口）请求主窗口打开页面 / 内容
  useEffect(() => listenMainWindowRequests(), []);
  return null;
}
