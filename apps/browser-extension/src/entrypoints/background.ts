import { STORAGE_KEY_PREFIX } from "@/content/types";
import { AI_SERVER_WS_URL } from "@/utils/aiServerAddress";
import WebSocketClient from "@/utils/WebSocketClient";
import { syncHighlightsToDesktop } from "@/services/excerptSync";

const EXCERPT_SYNC_ALARM = "tau-excerpt-sync";
const SYNC_DEBOUNCE_MS = 2000;
const CONNECT_TIMEOUT_MS = 5000;

/** 连上桌面 aiServer；桌面未启动时在超时内失败 */
function connect(): Promise<WebSocketClient> {
  return new Promise((resolve, reject) => {
    const client = new WebSocketClient(AI_SERVER_WS_URL);
    const timer = setTimeout(() => {
      client.disconnect();
      reject(new Error("连接桌面超时"));
    }, CONNECT_TIMEOUT_MS);
    client.onOpenHandler = () => {
      clearTimeout(timer);
      resolve(client);
    };
    client.onCloseHandler = () => {
      clearTimeout(timer);
      reject(new Error("桌面未启动"));
    };
    client.connect();
  });
}

let running: Promise<void> | null = null;
let rerun = false;

/** 划线同步进桌面摘录；同一时刻只跑一轮，运行中又有变化则结束后再跑一轮 */
function syncExcerpts() {
  if (running) {
    rerun = true;
    return;
  }
  running = (async () => {
    let client: WebSocketClient | null = null;
    try {
      client = await connect();
      const connected = client;
      await syncHighlightsToDesktop({
        request: (method, params) => connected.sendRequest(method, params, 30_000),
        storageGetAll: () => chrome.storage.local.get(null),
        storageSet: items => chrome.storage.local.set(items),
      });
    } catch {
      // 桌面未启动或请求失败：页保持脏，等下次变化或定时重试
    } finally {
      client?.disconnect();
      running = null;
      if (rerun) {
        rerun = false;
        syncExcerpts();
      }
    }
  })();
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncExcerpts, SYNC_DEBOUNCE_MS);
}

export default defineBackground(() => {
  // 点击扩展图标时直接打开 sidePanel
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (Object.keys(changes).some(key => key.startsWith(STORAGE_KEY_PREFIX))) scheduleSync();
  });
  chrome.runtime.onStartup.addListener(scheduleSync);
  chrome.runtime.onInstalled.addListener(scheduleSync);
  chrome.alarms.create(EXCERPT_SYNC_ALARM, { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === EXCERPT_SYNC_ALARM) syncExcerpts();
  });
});
