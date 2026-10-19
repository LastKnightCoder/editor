import { randomUUID } from "node:crypto";
import { BrowserWindow, type WebContents } from "electron";
import type {
  VideoProvidersState,
  VideoRendererReply,
  VideoRendererRequest,
  VideoRendererResults,
} from "../../../shared/video-renderer";

/** 主进程自身发起的调用（如学习资源索引队列）没有调用窗口。 */
const MAIN_CALLER = -1;

interface Host {
  contents: WebContents;
  session: string;
  state: VideoProvidersState;
}

interface Pending {
  caller: number;
  host: Host;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

const abortError = (message: string) => new DOMException(message, "AbortError");

/** 只在调用方与主窗口渲染宿主之间转发，不加载插件代码。 */
export class PluginVideoRelay {
  private readonly hosts = new Map<number, Host>();
  private readonly pending = new Map<string, Pending>();
  private readonly watched = new WeakSet<WebContents>();

  connect(contents: WebContents, session: string) {
    this.release(contents.id);
    this.hosts.set(contents.id, { contents, session, state: { ready: false, providers: [] } });
    this.watch(contents);
  }

  /** 调用窗口自身是宿主时就地执行，否则交给任一主窗口。 */
  private hostFor(caller: WebContents | null): Host | undefined {
    return (caller && this.hosts.get(caller.id)) ?? this.hosts.values().next().value;
  }

  providers(): VideoProvidersState {
    return this.hostFor(null)?.state ?? { ready: false, providers: [] };
  }

  publish(owner: number, session: string, state: VideoProvidersState) {
    const host = this.hosts.get(owner);
    if (host?.session !== session) return;
    host.state = {
      ready: state.ready === true,
      providers: state.providers.map(({ id, name }) => ({ id, name })),
    };
    this.broadcast();
  }

  private broadcast() {
    const providers = this.providers();
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed()) window.webContents.send("plugin-video:providers", providers);
  }

  private watch(contents: WebContents) {
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    const release = () => this.release(contents.id);
    contents.once("destroyed", release);
    contents.on("did-navigate", release);
    contents.on("render-process-gone", release);
  }

  release(owner: number, session?: string) {
    const host = this.hosts.get(owner);
    // 过期会话的迟到释放不影响同一窗口重新连接后的宿主。
    if (session && host?.session !== session) return;
    if (host) {
      this.hosts.delete(owner);
      this.broadcast();
    }
    for (const [id, pending] of this.pending)
      if (pending.caller === owner || pending.host.contents.id === owner) {
        this.pending.delete(id);
        this.notifyCancel(pending.host, id);
        pending.reject(abortError("视频插件宿主或调用窗口已关闭"));
      }
  }

  private notifyCancel(host: Host, requestId: string) {
    try {
      if (!host.contents.isDestroyed())
        host.contents.send("plugin-video:cancel", { requestId, hostSession: host.session });
    } catch {
      /* 渲染进程退出的竞态不能阻塞本地请求回收。 */
    }
  }

  request(caller: WebContents | null, requestId: string, request: VideoRendererRequest) {
    const host = this.hostFor(caller);
    if (!host || host.contents.isDestroyed())
      return Promise.reject(new Error("主窗口插件宿主不可用，请打开主窗口后重试"));
    if (caller?.isDestroyed()) return Promise.reject(new Error("视频调用窗口已关闭"));
    if (caller) this.watch(caller);
    if (this.pending.has(requestId)) return Promise.reject(new Error("视频请求已存在"));
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { caller: caller?.id ?? MAIN_CALLER, host, resolve, reject });
      try {
        host.contents.send("plugin-video:request", {
          requestId,
          hostSession: host.session,
          request,
        });
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel(caller: number, requestId: string) {
    const pending = this.pending.get(requestId);
    if (!pending || pending.caller !== caller) return;
    this.pending.delete(requestId);
    this.notifyCancel(pending.host, requestId);
    pending.reject(abortError("视频请求已取消"));
  }

  reply(owner: number, reply: VideoRendererReply) {
    const pending = this.pending.get(reply.requestId);
    if (
      !pending ||
      pending.host.contents.id !== owner ||
      pending.host.session !== reply.hostSession
    )
      return;
    this.pending.delete(reply.requestId);
    if (reply.error === undefined) pending.resolve(reply.result);
    else {
      const error = new Error(reply.error);
      error.name = reply.errorName ?? "Error";
      pending.reject(error);
    }
  }

  /** 主进程内部调用入口，取消信号同步转发给渲染宿主。 */
  async call<K extends VideoRendererRequest["kind"]>(
    request: Extract<VideoRendererRequest, { kind: K }>,
    signal?: AbortSignal
  ): Promise<VideoRendererResults[K]> {
    signal?.throwIfAborted();
    const requestId = randomUUID();
    const cancel = () => this.cancel(MAIN_CALLER, requestId);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return (await this.request(null, requestId, request)) as VideoRendererResults[K];
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
}

export const pluginVideoRelay = new PluginVideoRelay();
