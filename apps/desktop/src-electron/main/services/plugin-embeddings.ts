import { randomUUID } from "node:crypto";
import path from "node:path";
import type { WebContents } from "electron";
import { readLocalPluginState } from "@tau/plugins/local-state";
import type { JsonValue } from "@tau/plugins";
import PathUtil from "../utils/PathUtil";
import type {
  EmbeddingsProviderInfo,
  EmbeddingsRendererMessage,
  EmbeddingsRendererReply,
} from "../../../shared/embeddings-renderer";

interface Host {
  contents: WebContents;
  generation: string;
  providers: Map<string, EmbeddingsProviderInfo>;
}

interface Pending {
  host: Host;
  detach(): void;
  resolve(result: number[][]): void;
  reject(error: Error): void;
}

const abortError = (message: string) => new DOMException(message, "AbortError");
/** 超时不用 AbortError：队列会把 AbortError 当作用户取消/切库静默处理 */
const timeoutError = () => {
  const error = new Error("嵌入请求超时");
  error.name = "TimeoutError";
  return error;
};

const toProviderMap = (providers: EmbeddingsProviderInfo[]) =>
  new Map(providers.map(info => [info.pluginId, info]));

/** 嵌入调用由主进程主动发起、无调用窗口与任务会话：宿主只按 requestId 管理一次性请求。 */
export class PluginEmbeddingsRelay {
  constructor(private readonly validate: (pluginId: string) => Promise<void>) {}
  private readonly hosts = new Map<number, Host>();
  private readonly pending = new Map<string, Pending>();
  private readonly watched = new WeakSet<WebContents>();
  private readonly listeners = new Set<() => void>();

  onProvidersChanged(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private notifyProvidersChanged() {
    for (const listener of this.listeners) listener();
  }

  hasHost(owner: number, generation: string) {
    return this.hosts.get(owner)?.generation === generation;
  }

  connect(contents: WebContents, generation: string, providers: EmbeddingsProviderInfo[]) {
    this.release(contents.id);
    this.hosts.set(contents.id, { contents, generation, providers: toProviderMap(providers) });
    this.watch(contents);
    this.notifyProvidersChanged();
  }

  /** 宿主重连或插件上下线时刷新 provider 集合；旧 generation 的上报直接忽略。 */
  update(owner: number, generation: string, providers: EmbeddingsProviderInfo[]) {
    const host = this.hosts.get(owner);
    if (!host || host.generation !== generation) return;
    host.providers = toProviderMap(providers);
    this.notifyProvidersChanged();
  }

  release(owner: number, generation?: string) {
    const host = this.hosts.get(owner);
    if (!host) return;
    if (generation && host.generation !== generation) return;
    this.hosts.delete(owner);
    for (const [requestId, pending] of this.pending)
      if (pending.host === host) {
        this.pending.delete(requestId);
        pending.detach();
        pending.reject(abortError("嵌入宿主已断开"));
      }
    this.notifyProvidersChanged();
  }

  isReady(pluginId: string): boolean {
    return this.selectHost(pluginId) !== undefined;
  }

  maxBatchSize(pluginId: string): number | undefined {
    for (const host of this.hosts.values()) {
      const max = host.providers.get(pluginId)?.maxBatchSize;
      if (max !== undefined) return max;
    }
    return undefined;
  }

  async embed(
    pluginId: string,
    config: JsonValue,
    modelId: string,
    texts: string[],
    signal?: AbortSignal,
    timeoutMs = 120_000
  ): Promise<number[][]> {
    signal?.throwIfAborted();
    // 每次检索都会经过这里，只校验启用意图；包完整性由渲染宿主激活时把关
    await this.validate(pluginId);
    signal?.throwIfAborted();
    const host = this.selectHost(pluginId);
    if (!host) throw new Error("嵌入插件未就绪，请确认插件已启用且主窗口已打开");
    const requestId = randomUUID();
    return new Promise<number[][]>((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => this.cancelPending(requestId, timeoutError()), timeoutMs)
          : null;
      const onAbort = () => this.cancelPending(requestId, abortError("嵌入请求已取消"));
      const pending: Pending = {
        host,
        detach: () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        },
        resolve,
        reject,
      };
      this.pending.set(requestId, pending);
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        host.contents.send("plugin-embeddings:request", {
          requestId,
          hostSession: host.generation,
          request: { pluginId, config, modelId, texts },
        } satisfies EmbeddingsRendererMessage);
      } catch {
        // 渲染进程退出的竞态：不再向宿主发 cancel，直接本地回收
        this.cancelPending(requestId, abortError("嵌入宿主已断开"), false);
      }
    });
  }

  reply(owner: number, reply: EmbeddingsRendererReply) {
    const pending = this.pending.get(reply.requestId);
    if (
      !pending ||
      pending.host.contents.id !== owner ||
      pending.host.generation !== reply.hostSession
    )
      return;
    this.pending.delete(reply.requestId);
    pending.detach();
    if (reply.error !== undefined) {
      const error = new Error(reply.error);
      error.name = reply.errorName ?? "Error";
      pending.reject(error);
      return;
    }
    if (!Array.isArray(reply.result)) {
      pending.reject(new Error("嵌入插件返回的结果无效"));
      return;
    }
    pending.resolve(reply.result);
  }

  private selectHost(pluginId: string): Host | undefined {
    for (const host of this.hosts.values())
      if (host.providers.has(pluginId) && !host.contents.isDestroyed()) return host;
    return undefined;
  }

  private cancelPending(requestId: string, error: Error, notifyHost = true) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.detach();
    if (notifyHost)
      this.control(pending.host, "plugin-embeddings:cancel", {
        requestId,
        hostSession: pending.host.generation,
      });
    pending.reject(error);
  }

  private control(host: Host, channel: string, data: object) {
    try {
      if (!host.contents.isDestroyed()) host.contents.send(channel, data);
    } catch {
      /* 渲染进程退出的竞态不能阻塞本地回收。 */
    }
  }

  private watch(contents: WebContents) {
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    const release = () => this.release(contents.id);
    contents.once("destroyed", release);
    contents.on("did-navigate", release);
    contents.on("render-process-gone", release);
  }
}

export const pluginEmbeddingsRelay = new PluginEmbeddingsRelay(async pluginId => {
  const directory = path.join(PathUtil.getAppDir(), "plugins");
  if (!(await readLocalPluginState(directory)).enabled[pluginId])
    throw new Error("嵌入插件尚未启用");
});
