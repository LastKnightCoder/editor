export default defineBackground(() => {
  // 点击扩展图标时直接打开 sidePanel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
