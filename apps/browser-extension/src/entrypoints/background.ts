export default defineBackground(() => {
  // 点击扩展图标时直接打开 sidePanel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // 监听来自 content script 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TAU_ASK_AI") {
      // 转发 AI问书 请求给 sidePanel
      // 先确保 sidePanel 已打开
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.sidePanel
          .open({ tabId })
          .then(() => {
            // 延迟发送，等 sidePanel 初始化
            setTimeout(() => {
              chrome.runtime.sendMessage({
                type: "TAU_ASK_AI_FORWARD",
                text: message.text,
                url: message.url,
              });
            }, 500);
          })
          .catch(console.error);
      }
      sendResponse({ ok: true });
    }
    return false;
  });
});
