import { useEffect, useLayoutEffect, useRef } from "react";
import { usePage } from "@/page/PageProvider";
import { bindPageNavigation } from "@/services/page-navigation";
import { initAiServer, closeAiServer } from "@/services/aiServer";

export function PageNavigationBridge() {
  const { navigator, state } = usePage();
  const current = useRef({ navigator, state });
  useLayoutEffect(() => {
    current.current = { navigator, state };
  }, [navigator, state]);
  useLayoutEffect(() => bindPageNavigation(() => current.current), []);
  useEffect(() => {
    initAiServer();
    return closeAiServer;
  }, []);
  return null;
}
