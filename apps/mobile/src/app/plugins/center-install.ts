import type { QueryClient } from "@tanstack/react-query";
import {
  installMobileCenterRelease,
  refreshMobileCenterInstallations,
} from "../../services/pluginCenter";
import { cancelMobilePlugin, MOBILE_PLUGIN_QUERY } from "../../services/plugins";

export interface CenterInstallSnapshot {
  phase: "idle" | "downloading" | "checking" | "pending";
  status: "idle" | "pending" | "success" | "error";
  pluginId: string | null;
  releaseId: string | null;
  error: unknown;
}

/** 任务随应用 QueryClient 存活；页面只订阅，不拥有取消权。 */
export class MobileCenterInstallStore {
  private snapshot: CenterInstallSnapshot = {
    phase: "idle",
    status: "idle",
    pluginId: null,
    releaseId: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private active: { pluginId: string; controller: AbortController } | null = null;

  constructor(private readonly client: QueryClient) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<CenterInstallSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  private refresh = async () => {
    await Promise.all([
      this.client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY }),
      this.client.invalidateQueries({ queryKey: ["mobile-plugin-center"] }),
    ]);
  };

  install = async (pluginId: string, releaseId: string) => {
    if (this.active) throw new Error("已有安装操作正在进行");
    const controller = new AbortController();
    this.active = { pluginId, controller };
    this.update({ phase: "downloading", status: "pending", pluginId, releaseId, error: null });
    try {
      await installMobileCenterRelease(pluginId, releaseId, controller.signal, phase =>
        this.update({ phase })
      );
      controller.signal.throwIfAborted();
      this.update({ phase: "pending", status: "success" });
    } catch (error) {
      this.update({
        phase: "idle",
        status: controller.signal.aborted ? "idle" : "error",
        error: controller.signal.aborted ? null : error,
      });
      throw error;
    } finally {
      this.active = null;
      await this.refresh();
    }
  };
  cancel = async () => {
    const pending = this.active;
    if (!pending) return;
    pending.controller.abort();
    await cancelMobilePlugin(pending.pluginId);
  };
  retry = async () => {
    const { status, pluginId, releaseId } = this.snapshot;
    if (status !== "error" || !pluginId || !releaseId) throw new Error("没有可重试的安装任务");
    await this.install(pluginId, releaseId);
  };
  reset = () => {
    if (this.active) return;
    this.update({ phase: "idle", status: "idle", pluginId: null, releaseId: null, error: null });
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
