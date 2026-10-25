import { CompanionConnection, type KeyValueStore } from "../background/connection";
import type { SocketLike } from "../background/rpc-socket";
import { AnnotationStore } from "../background/annotation-store";
import { CompanionHub, extensionPageOf, type PortLike } from "../background/hub";
import { describeClient } from "../background/client-info";
import { LibraryTab } from "../background/library-tab";
import { PORT_NAME, type ExtensionPageMessage, type ExtensionPageReply } from "../shared/messages";
import { STATUS_KEY } from "../shared/note-storage";

const storage: KeyValueStore = {
  async get<T>(key: string) {
    const value = await chrome.storage.local.get(key);
    return value[key] as T | undefined;
  },
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: key => chrome.storage.local.remove(key),
};

export default defineBackground(() => {
  const hub = new CompanionHub();
  const connection = new CompanionConnection({
    storage,
    createSocket: url => new WebSocket(url) as unknown as SocketLike,
    info: describeClient(
      navigator.userAgent,
      (navigator as Navigator & { userAgentData?: never }).userAgentData,
      chrome.runtime.getManifest().version
    ),
    onStatus: status => {
      hub.broadcastStatus(status);
      // 笔记页（扩展页面）经存储读取连接状态与主题
      void storage.set(STATUS_KEY, status);
    },
    onNotification: (method, data) => hub.onNotification(method, data),
    onRequest: (method, params) => hub.onRequest(method, params),
    onReady: () => void annotations.flush(),
  });
  const annotations = new AnnotationStore(storage, {
    isReady: () => connection.current.state === "ready",
    request: (method, params) => connection.request(method, params),
  });
  const library = new LibraryTab(
    {
      create: props => chrome.tabs.create(props),
      update: (tabId, props) => chrome.tabs.update(tabId, props),
      focusWindow: windowId => chrome.windows.update(windowId, { focused: true }),
    },
    chrome.runtime.getURL("/library.html")
  );
  hub.bind(connection, annotations, library);

  chrome.runtime.onConnect.addListener(port => {
    // 只接受本扩展内容脚本的端口
    if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id) return port.disconnect();
    hub.attach(port as unknown as PortLike, port.sender?.tab?.id);
  });
  chrome.runtime.onMessage.addListener((message: ExtensionPageMessage, sender, sendResponse) => {
    const page = message?.kind === "page-rpc" ? extensionPageOf(sender, chrome.runtime.id) : null;
    if (!page) return false;
    hub
      .handleExtensionPage(page, message.method, message.params)
      .then(result => sendResponse({ ok: true, result } satisfies ExtensionPageReply))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies ExtensionPageReply)
      );
    return true;
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "toggle-companion") hub.toggle(tab?.id);
    if (command === "open-library") void library.open();
  });
  chrome.action.onClicked.addListener(tab => hub.toggle(tab.id));

  void connection.start();
});
