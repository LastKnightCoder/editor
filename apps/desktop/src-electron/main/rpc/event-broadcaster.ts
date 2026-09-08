import { app } from "electron";
import type { WebContents } from "electron";
import WebSocketClient from "../utils/WebSocketServer";
import { RpcMessageType, type RpcNotificationMessage } from "@/types";
import { RPC_EVENTS_WS_PATH, serialize, type EventMessage } from "@tau/rpc";
import { getRpcToken } from "./command-server";

const EVENT_METHOD = "rpc-event";
// broadcaster 未连上 hub 时的事件缓冲上限（覆盖启动期，超出丢最旧）
const BUFFER_LIMIT = 5000;

type BroadcastMessage = RpcNotificationMessage<EventMessage>;

/** 未连接期间的待发事件：保存原始 args，flush 时才序列化（避免无连接时白付序列化成本） */
interface PendingEvent {
  channel: string;
  args: unknown[];
  windowId: number;
}

class RpcEventBroadcaster {
  private client: WebSocketClient<BroadcastMessage> | null = null;
  private buffer: PendingEvent[] = [];
  private patchInstalled = false;

  /**
   * 拦截所有 webContents.send：原 IPC 发送保持不变（兼容安全网），
   * 同时把事件以 windowId 路由进 WS 广播通道。
   * 必须在第一个窗口创建之前安装，配合缓冲机制保证启动期事件不丢。
   */
  installWebContentsPatch(): void {
    if (this.patchInstalled) {
      return;
    }
    this.patchInstalled = true;
    // Electron 主进程运行时未导出 WebContents 类，无法 patch 原型；
    // 官方 web-contents-created 事件覆盖所有实例（窗口/webview），按实例覆写 send
    app.on("web-contents-created", (_event, contents: WebContents) => {
      const originalSend = contents.send.bind(contents);
      contents.send = (channel: string, ...args: unknown[]) => {
        originalSend(channel, ...args);
        rpcEventBroadcaster.enqueue(contents.id, channel, args);
      };
    });
  }

  private enqueue(windowId: number, channel: string, args: unknown[]): void {
    if (this.client?.isConnected()) {
      this.emit(windowId, channel, args);
      return;
    }
    this.buffer.push({ channel, args, windowId });
    if (this.buffer.length > BUFFER_LIMIT) {
      this.buffer.splice(0, this.buffer.length - BUFFER_LIMIT);
    }
  }

  private emit(windowId: number, channel: string, args: unknown[]): void {
    let serializedArgs: unknown[];
    try {
      serializedArgs = args.map(arg => serialize(arg));
    } catch (error) {
      // 事件数据超出协议白名单：开发期立即暴露，修复该事件的 payload 格式
      console.error(
        `[rpc-event] 事件 "${channel}" 参数序列化失败，该事件将无法经 WS 通道送达`,
        error
      );
      return;
    }
    this.client?.sendMessage(
      JSON.stringify({
        type: RpcMessageType.Notification,
        method: EVENT_METHOD,
        data: { channel, args: serializedArgs, windowId } satisfies EventMessage,
      } satisfies BroadcastMessage)
    );
  }

  /** 连接 /rpc-events hub（需在 server 模块 listen 之后调用），连接建立后 flush 缓冲 */
  start(port: number): void {
    if (this.client) {
      return;
    }
    // token 经查询参数传递：服务端对 /rpc-events 升级做同源 token 校验（打包模式）
    this.client = new WebSocketClient<BroadcastMessage>(
      `ws://localhost:${port}${RPC_EVENTS_WS_PATH}?isServer=true&token=${getRpcToken()}`,
      {
        onOpen: () => {
          const pending = this.buffer;
          this.buffer = [];
          for (const { channel, args, windowId } of pending) {
            this.emit(windowId, channel, args);
          }
        },
      }
    );
  }
}

const rpcEventBroadcaster = new RpcEventBroadcaster();

export default rpcEventBroadcaster;
