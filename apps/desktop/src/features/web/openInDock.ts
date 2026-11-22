/**
 * 在右栏打开网页：主窗口里的 http(s) 链接进右栏（临时盖住当前视图，关闭即回到它），
 * 其余情况（独立窗口、非网页协议）交给系统浏览器。
 */

import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "@tau/ui";
import { useAssistOwnerStore } from "@/app/assistOwner";
import { getAssistView } from "@/app/assistViews";
import { useShellStore } from "@/app/shellStore";
import { getPageNavigation } from "@/services/page-navigation";
import { openExternal } from "@/commands";
import { isMainWindow } from "@/utils/window-role";
import { isWebUrl } from "../../../shared/web-dock";

interface WebDockRequest {
  url: string;
  coveredPageChat?: symbol;
  /** 同一网址重复打开也要重新加载 */
  id: number;
}

export const useWebDockStore = create<{ request: WebDockRequest | null }>(() => ({
  request: null,
}));
let nextRequestId = 0;

/** macOS 的 Ctrl + 主键单击产生 contextmenu，其他桌面平台产生 click。 */
export function useExternalWebLinkClick() {
  useEffect(() => {
    const openLink = (event: MouseEvent) => {
      if (!event.ctrlKey || event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest("button, [data-web-link]");
      const url = target?.getAttribute("data-web-link");
      if (!url || !isWebUrl(url)) return;
      event.preventDefault();
      event.stopPropagation();
      void openExternal(url).catch(() => toast.error("打开链接失败"));
    };
    window.addEventListener("click", openLink, true);
    window.addEventListener("contextmenu", openLink, true);
    return () => {
      window.removeEventListener("click", openLink, true);
      window.removeEventListener("contextmenu", openLink, true);
    };
  }, []);
}

export function clearWebDock() {
  useShellStore.getState().closeAssist("web");
  useWebDockStore.setState({ request: null });
}

export async function openWebInDock(url: string) {
  const target = url.trim();
  if (!isMainWindow() || !isWebUrl(target)) return openExternal(target);
  const shell = useShellStore.getState();
  const key = getPageNavigation().navigator.current()?.key;
  const owner = key && useAssistOwnerStore.getState().owners[key];
  const coveredPageChat =
    shell.assistView === "web"
      ? useWebDockStore.getState().request?.coveredPageChat
      : owner && owner.isChatOpen()
        ? owner.instance
        : undefined;
  useWebDockStore.setState({ request: { url: target, id: ++nextRequestId, coveredPageChat } });
  const currentView = getAssistView(shell.assistView);
  if (currentView?.hiddenOn?.({ key, ownsChat: !!owner })) shell.showAssist("web");
  else shell.showAssistOver("web");
}
