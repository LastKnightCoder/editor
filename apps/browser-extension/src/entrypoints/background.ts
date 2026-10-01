import { installWsRelay } from "@/utils/wsRelay";

export default defineBackground(() => {
  // 点击扩展图标时直接打开 sidePanel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // 划词问答等 content script 的桌面连接经后台转发
  installWsRelay();
});
