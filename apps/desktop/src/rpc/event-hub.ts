import { deserialize, RPC_EVENTS_WS_PATH, type EventMessage } from "@tau/rpc";
import { getRpcConfig } from "./config";

type Listener = (...args: unknown[]) => void;

const EVENT_METHOD = "rpc-event";
const NOTIFICATION_TYPE = "JsonRpcNotification";
const RECONNECT_INTERVAL_MS = 3000;

/** baseUrl 为空（同源部署）时按当前页面协议推导 ws/wss，其余情况仅做协议替换 */
function toWsUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${path}`;
  }
  return `${baseUrl.replace(/^http/, "ws")}${path}`;
}

// IPC 监听器契约为 (event, ...args)，业务大量按 (_event, data) 解构取第二个参数，
// 分发时补一个占位 event 保持与 ipcRenderer.on 的签名对等（无监听器读取其属性）
const MOCK_IPC_EVENT = { senderId: -1, processId: 0, frameId: 0 };

export class RpcEventHub {
  private listeners = new Map<string, Set<Listener>>();
  private started = false;
  private windowId = 0;
  private wsUrl = "";

  /** 应用启动时调用一次；重复调用无副作用。启动竞态失败时自动退避重试 */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      const config = await getRpcConfig();
      this.windowId = config.windowId;
      // token 经查询参数附带（WS 无法携带自定义头），Electron 打包模式服务端会校验；
      // Web 模式下 token 为空串，鉴权交由未来 Web Server 自行定义
      this.wsUrl = toWsUrl(
        config.baseUrl,
        `${RPC_EVENTS_WS_PATH}?isServer=false&token=${encodeURIComponent(config.token)}`
      );
      this.connect();
    } catch (error) {
      // bootstrap 竞态失败时不让事件系统永久失效，退避后重新解析配置
      this.started = false;
      console.error("[rpc-event] 启动失败，稍后重试:", error);
      setTimeout(() => void this.start(), RECONNECT_INTERVAL_MS);
    }
  }

  private connect(): void {
    const ws = new WebSocket(this.wsUrl);
    ws.onmessage = event => {
      try {
        this.handleMessage(JSON.parse(event.data as string));
      } catch (error) {
        console.error("[rpc-event] 消息解析失败:", error);
      }
    };
    ws.onclose = () => {
      setTimeout(() => this.connect(), RECONNECT_INTERVAL_MS);
    };
    ws.onerror = () => {
      // 重连由 onclose 统一调度，这里仅避免未处理告警
    };
  }

  private handleMessage(message: unknown): void {
    const msg = message as {
      type?: string;
      method?: string;
      data?: EventMessage;
    };
    if (msg?.type !== NOTIFICATION_TYPE || msg.method !== EVENT_METHOD) {
      // 心跳与其他通知（server-ready 等）直接忽略
      return;
    }
    const { channel, args, windowId } = msg.data ?? {};
    if (typeof channel !== "string") {
      return;
    }
    // windowId 为 0 视为广播；本端 windowId 为 0（Web 模式）时接收全部事件
    if (windowId !== 0 && this.windowId !== 0 && windowId !== this.windowId) {
      return;
    }
    const channelListeners = this.listeners.get(channel);
    if (!channelListeners?.size) {
      return;
    }
    const restoredArgs = (args ?? []).map(arg => deserialize(arg));
    for (const listener of [...channelListeners]) {
      try {
        listener(MOCK_IPC_EVENT, ...restoredArgs);
      } catch (error) {
        console.error(`[rpc-event] "${channel}" 监听器执行失败:`, error);
      }
    }
  }

  on<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): void {
    let channelListeners = this.listeners.get(channel);
    if (!channelListeners) {
      channelListeners = new Set();
      this.listeners.set(channel, channelListeners);
    }
    // 动态通道的参数由发布方与订阅方约定；仅在传输边界擦除类型，保留函数身份供 off 清理。
    channelListeners.add(listener as Listener);
  }

  off<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): void {
    const channelListeners = this.listeners.get(channel);
    if (!channelListeners) {
      return;
    }
    channelListeners.delete(listener as Listener);
    if (!channelListeners.size) {
      this.listeners.delete(channel);
    }
  }
}

export default new RpcEventHub();
