import { CompanionConnection, type KeyValueStore } from "../background/connection";
import type { SocketLike } from "../background/rpc-socket";
import { AnnotationStore } from "../background/annotation-store";
import { CompanionHub, type PortLike } from "../background/hub";
import { describeClient } from "../background/client-info";
import { isNotePageSender } from "../background/hub";
import { PORT_NAME } from "../shared/messages";
import { STATUS_KEY, type NotePageMessage, type NotePageReply } from "../shared/note-storage";

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
  hub.bind(connection, annotations);

  chrome.runtime.onConnect.addListener(port => {
    // 只接受本扩展内容脚本的端口
    if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id) return port.disconnect();
    hub.attach(port as unknown as PortLike, port.sender?.tab?.id);
  });
  chrome.runtime.onMessage.addListener((message: NotePageMessage, sender, sendResponse) => {
    if (message?.kind !== "note-rpc" || !isNotePageSender(sender, chrome.runtime.id)) return false;
    hub
      .handleNotePage(message.method, message.params)
      .then(result => sendResponse({ ok: true, result } satisfies NotePageReply))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies NotePageReply)
      );
    return true;
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "toggle-companion") hub.toggle(tab?.id);
  });
  chrome.action.onClicked.addListener(tab => hub.toggle(tab.id));

  void connection.start();
});
