import { useEffect, useLayoutEffect, useRef } from "react";
import { usePage } from "@/page/PageProvider";
import { bindPageNavigation, listenOpenPageRequests } from "@/services/page-navigation";
import { initAiServer, closeAiServer } from "@/services/aiServer";

export function PageNavigationBridge() {
  const { navigator, state } = usePage();
  const current = useRef({ navigator, state });
  useLayoutEffect(() => {
    current.current = { navigator, state };
  }, [navigator, state]);
  useLayoutEffect(() => bindPageNavigation(() => current.current), []);
  // 辅助窗口（番茄小窗等）请求主窗口打开页面
  useEffect(() => listenOpenPageRequests(), []);
  useEffect(() => {
    initAiServer();
    return closeAiServer;
  }, []);
  return null;
}
