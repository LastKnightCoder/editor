import type { QueryClient } from "@tanstack/react-query";
import {
  installMobileCenterRelease,
  refreshMobileCenterInstallations,
} from "../../services/pluginCenter";
import { cancelMobilePlugin, MOBILE_PLUGIN_QUERY } from "../../services/plugins";

/** 原生侧最多 4 个并发下载且与开发安装共用，中心任务留一个余量，其余排队。 */
const MAX_PARALLEL = 3;

export interface CenterInstallTask {
  pluginId: string;
  releaseId: string;
  /** queued 为等待并发名额；pending 为已暂存、等待会话生效。 */
  phase: "queued" | "downloading" | "checking" | "pending";
  status: "pending" | "success" | "error";
  error: unknown;
}
/** 按插件分开的任务表；同一插件同时只有一个任务，取消后条目移除。 */
export type CenterInstallSnapshot = ReadonlyMap<string, CenterInstallTask>;

/** 任务随应用 QueryClient 存活；页面只订阅，不拥有取消权。不同插件可并行安装。 */
export class MobileCenterInstallStore {
  private snapshot: CenterInstallSnapshot = new Map();
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private running = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly client: QueryClient) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private write(pluginId: string, task: CenterInstallTask | null) {
    const next = new Map(this.snapshot);
    if (task) next.set(pluginId, task);
    else next.delete(pluginId);
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
  private patch(pluginId: string, next: Partial<CenterInstallTask>) {
    const task = this.snapshot.get(pluginId);
    if (task) this.write(pluginId, { ...task, ...next });
  }
  private refresh = async () => {
    await Promise.all([
      this.client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY }),
      this.client.invalidateQueries({ queryKey: ["mobile-plugin-center"] }),
    ]);
  };
  private async acquire(signal: AbortSignal) {
    if (this.running < MAX_PARALLEL) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal.removeEventListener("abort", abort);
        this.running++;
        resolve();
      };
      const abort = () => {
        this.waiting = this.waiting.filter(item => item !== grant);
        reject(signal.reason);
      };
      this.waiting.push(grant);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  private release() {
    this.running--;
    this.waiting.shift()?.();
  }

  install = async (pluginId: string, releaseId: string) => {
    if (this.controllers.has(pluginId)) throw new Error("该插件已有安装操作正在进行");
    const controller = new AbortController();
    this.controllers.set(pluginId, controller);
    this.write(pluginId, { pluginId, releaseId, phase: "queued", status: "pending", error: null });
    try {
      await this.acquire(controller.signal);
      try {
        this.patch(pluginId, { phase: "downloading" });
        await installMobileCenterRelease(pluginId, releaseId, controller.signal, phase =>
          this.patch(pluginId, { phase })
        );
        controller.signal.throwIfAborted();
      } finally {
        this.release();
      }
      this.patch(pluginId, { phase: "pending", status: "success" });
    } catch (error) {
      if (controller.signal.aborted) this.write(pluginId, null);
      else this.patch(pluginId, { status: "error", error });
      throw error;
    } finally {
      this.controllers.delete(pluginId);
      await this.refresh();
    }
  };
  cancel = async (pluginId: string) => {
    const controller = this.controllers.get(pluginId);
    if (!controller) return;
    // 排队中的任务还没碰原生暂存区；原生取消会清掉已有的待生效包，不能误调
    const started = this.snapshot.get(pluginId)?.phase !== "queued";
    controller.abort();
    if (started) await cancelMobilePlugin(pluginId);
  };
  retry = async (pluginId: string) => {
    const task = this.snapshot.get(pluginId);
    if (task?.status !== "error") throw new Error("没有可重试的安装任务");
    await this.install(pluginId, task.releaseId);
  };
  refreshStatuses = async () => {
    await refreshMobileCenterInstallations();
    await this.refresh();
  };
}

const stores = new WeakMap<QueryClient, MobileCenterInstallStore>();
export function getMobileCenterInstallStore(client: QueryClient) {
  let store = stores.get(client);
  if (!store) {
    store = new MobileCenterInstallStore(client);
    stores.set(client, store);
  }
  return store;
}
