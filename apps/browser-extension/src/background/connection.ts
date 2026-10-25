/**
 * 到 Tau 的连接状态机（不依赖 chrome.*，存储与 socket 注入，便于单测）：
 * - 有 token：hello 校验后就绪；断线按退避重连；token 失效（被撤销 / Tau 换了数据）即删 token 回到未配对；
 * - 无 token：只在用户打开面板时发起配对（pair.request），等 Tau 弹窗里允许后拿到 token。
 */
import {
  BROWSER_COMPANION_PATH,
  BROWSER_COMPANION_PORT,
  COMPANION_METHODS,
  deriveSas,
  randomHex,
  type AppearanceData,
  type ClientInfo,
  type PairGrantedData,
  type PairRequestResult,
  type ReadyData,
} from "@tau/shared/browser-companion";
import type { ConnectionStatus } from "../shared/messages";
import { RpcSocket, type SocketLike } from "./rpc-socket";

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ConnectionDeps {
  storage: KeyValueStore;
  createSocket(url: string): SocketLike;
  info: ClientInfo;
  onStatus(status: ConnectionStatus): void;
  onNotification(method: string, data: unknown): void;
  onRequest(method: string, params: unknown): Promise<unknown>;
  /** 就绪时回调（补发离线期间的标注） */
  onReady(): void;
}

export const COMPANION_URL = `ws://127.0.0.1:${BROWSER_COMPANION_PORT}${BROWSER_COMPANION_PATH}`;
const KEEPALIVE_MS = 20_000;
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];

const TOKEN_KEY = "companion.token";
const CLIENT_ID_KEY = "companion.clientId";

export class CompanionConnection {
  private socket: RpcSocket | null = null;
  private status: ConnectionStatus = { state: "unpaired" };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private busy = false;

  constructor(private readonly deps: ConnectionDeps) {}

  get current(): ConnectionStatus {
    return this.status;
  }

  /** service worker 启动：已配对就连 */
  async start(): Promise<void> {
    if (await this.deps.storage.get<string>(TOKEN_KEY)) await this.hello();
    else this.setStatus({ state: "unpaired" });
  }

  /** 用户触发：已配对立即重连，否则发起配对 */
  async connect(): Promise<ConnectionStatus> {
    if (this.status.state === "ready" || this.status.state === "pairing" || this.busy)
      return this.status;
    this.clearRetry();
    if (await this.deps.storage.get<string>(TOKEN_KEY)) await this.hello();
    else await this.pair();
    return this.status;
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (this.status.state !== "ready" || !this.socket)
      return Promise.reject(new Error("Tau 未连接"));
    return this.socket.request<T>(method, params, timeoutMs);
  }

  private async clientId(): Promise<string> {
    const existing = await this.deps.storage.get<string>(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = randomHex(12);
    await this.deps.storage.set(CLIENT_ID_KEY, created);
    return created;
  }

  private async open(): Promise<RpcSocket | null> {
    this.socket?.close();
    const raw = this.deps.createSocket(COMPANION_URL);
    try {
      await RpcSocket.open(raw);
    } catch {
      return null;
    }
    const socket = new RpcSocket(raw, {
      onNotification: (method, data) => this.onNotification(socket, method, data),
      onRequest: (method, params) => this.deps.onRequest(method, params),
      onClose: () => this.onClose(socket),
    });
    this.socket = socket;
    return socket;
  }

  private async hello(): Promise<void> {
    const token = await this.deps.storage.get<string>(TOKEN_KEY);
    if (!token) return this.setStatus({ state: "unpaired" });
    this.busy = true;
    try {
      this.setStatus({ state: "connecting" });
      const socket = await this.open();
      if (!socket) return this.scheduleRetry();
      try {
        const ready = await socket.request<ReadyData>(COMPANION_METHODS.hello, {
          clientId: await this.clientId(),
          token,
          info: this.deps.info,
        });
        this.becomeReady(ready);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "unknown-client" || message === "bad-token") {
          await this.deps.storage.remove(TOKEN_KEY);
          this.setStatus({ state: "revoked" });
        } else this.scheduleRetry();
      }
    } finally {
      this.busy = false;
    }
  }

  private async pair(): Promise<void> {
    this.busy = true;
    try {
      this.setStatus({ state: "connecting" });
      const socket = await this.open();
      if (!socket) return this.setStatus({ state: "offline" });
      const nonce = randomHex();
      const result = await socket
        .request<PairRequestResult>(COMPANION_METHODS.pairRequest, {
          clientId: await this.clientId(),
          info: this.deps.info,
          nonce,
        })
        .catch(() => null);
      if (!result) return this.setStatus({ state: "offline" });
      if (result.status === "closed") return this.setStatus({ state: "closed" });
      if (result.status === "throttled")
        return this.setStatus({ state: "throttled", retryAt: result.retryAt });
      this.setStatus({ state: "pairing", code: await deriveSas(nonce, result.nonce) });
    } finally {
      this.busy = false;
    }
  }

  private onNotification(socket: RpcSocket, method: string, data: unknown): void {
    if (socket !== this.socket) return;
    switch (method) {
      case COMPANION_METHODS.pairGranted:
        void this.deps.storage.set(TOKEN_KEY, (data as PairGrantedData).token);
        return;
      case COMPANION_METHODS.ready:
        this.becomeReady(data as ReadyData);
        return;
      case COMPANION_METHODS.pairDenied:
        this.setStatus({ state: "denied" });
        return;
      case COMPANION_METHODS.revoked:
        void this.deps.storage.remove(TOKEN_KEY);
        this.setStatus({ state: "revoked" });
        return;
      case COMPANION_METHODS.appearanceChanged:
        if (this.status.state === "ready")
          this.setStatus({ ...this.status, appearance: data as AppearanceData });
        this.deps.onNotification(method, data);
        return;
      default:
        this.deps.onNotification(method, data);
    }
  }

  private becomeReady(ready: ReadyData): void {
    this.attempt = 0;
    this.clearRetry();
    this.setStatus({ state: "ready", scopes: ready.scopes, appearance: ready.appearance });
    if (this.keepalive) clearInterval(this.keepalive);
    // 有 WebSocket 活动时 MV3 service worker 不会被回收
    this.keepalive = setInterval(() => this.socket?.notify("ping"), KEEPALIVE_MS);
    this.deps.onReady();
  }

  private onClose(socket: RpcSocket): void {
    if (socket !== this.socket) return;
    this.socket = null;
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    // 握手中的断开由 hello / pair 自己收尾
    if (this.status.state === "ready") this.scheduleRetry();
    else if (this.status.state === "pairing") this.setStatus({ state: "offline" });
  }

  private scheduleRetry(): void {
    this.setStatus({ state: "offline" });
    this.clearRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.hello();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.deps.onStatus(status);
  }
}
