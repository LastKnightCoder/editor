/**
 * 发布运行态全局 store —— 进度与结果不随发布页卸载丢失。
 *
 * 发布在主进程执行，离开页面（后退弹栈 / LRU 卸载）后仍会跑完；运行态若留在组件内，
 * 回来即变回「就绪」且可再次点发布（主进程无并发锁）。故 run 与进度监听提到模块级：
 * 进度 handler 随 WebSocket client 常驻注册，不受页面 Activity 隐藏停驻影响；
 * start() 在 running 时直接忽略，保证同一时刻只有一次发布。
 */

import { create } from "zustand";
import { toast } from "@tau/ui";
import { EPublishProvider } from "@/stores/useSettingStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import { downloadPublishTemplate, executePublish } from "@/commands";
import { exportPublishOutput } from "@/commands/publish";
import type { IPublishProgress, IPublishResult } from "@/types/publish";
import type { PublishConfig } from "./usePublishConfig";

export type RunState =
  | { kind: "idle" }
  | { kind: "running"; startedAt: number; progress: IPublishProgress | null }
  | { kind: "done"; finishedAt: number; duration: number; result: IPublishResult }
  | { kind: "exported"; finishedAt: number; duration: number; targetDir: string }
  | { kind: "error"; message: string };

export interface PublishRunParams {
  active: EPublishProvider;
  providerConfig: PublishConfig["providerConfig"];
  publish: PublishConfig["publish"];
  appearance: PublishConfig["appearance"];
  /** 本地导出的输出目录（云端发布忽略） */
  targetDir?: string;
}

interface PublishRunStore {
  run: RunState;
  /** 每次发布结束（成功/失败）自增，页面据此刷新历史与计划 */
  finishSeq: number;
  start: (params: PublishRunParams) => Promise<void>;
  reset: () => void;
}

export const usePublishRunStore = create<PublishRunStore>()((set, get) => ({
  run: { kind: "idle" },
  finishSeq: 0,
  start: async ({ active, providerConfig, publish, appearance, targetDir = "" }) => {
    if (get().run.kind === "running") return;
    const startedAt = Date.now();
    set({ run: { kind: "running", startedAt, progress: null } });
    let next: RunState;
    try {
      await downloadPublishTemplate();
      if (active === EPublishProvider.Local) {
        await exportPublishOutput({
          targetDir,
          providerType: EPublishProvider.Local,
          providerConfig: { basePath: publish.local.basePath },
          siteConfig: publish.site,
          settings: { appearance },
        });
        const finishedAt = Date.now();
        next = { kind: "exported", finishedAt, duration: finishedAt - startedAt, targetDir };
      } else {
        const result = await executePublish({
          providerType: active,
          providerConfig,
          siteConfig: publish.site,
          settings: { appearance },
        });
        const finishedAt = Date.now();
        next = { kind: "done", finishedAt, duration: finishedAt - startedAt, result };
      }
    } catch (error) {
      next = { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    set(s => ({ run: next, finishSeq: s.finishSeq + 1 }));
    notifyFinished(next);
  },
  reset: () => {
    if (get().run.kind !== "running") set({ run: { kind: "idle" } });
  },
}));

/** 结束时 toast 一次：用户可能已离开发布页，结果卡看不到 */
function notifyFinished(run: RunState) {
  if (run.kind === "done") {
    const { uploaded, failed } = run.result;
    if (failed.length === 0) toast.success(`发布完成：${uploaded.length} 个文件已上传`);
    else toast.warning(`发布完成，${failed.length} 个文件失败`);
  } else if (run.kind === "exported") {
    toast.success("静态站点已导出");
  } else if (run.kind === "error") {
    toast.error(`发布失败：${run.message}`);
  }
}

/* ── 进度监听：随 client 常驻注册（client 替换时迁移） ── */
const handleProgress = (data: unknown) => {
  const { run } = usePublishRunStore.getState();
  if (run.kind !== "running") return;
  usePublishRunStore.setState({ run: { ...run, progress: data as IPublishProgress } });
};

let boundClient: ReturnType<typeof useBackendWebsocketStore.getState>["client"] = null;
const bindClient = (client: typeof boundClient) => {
  if (client === boundClient) return;
  boundClient?.unregisterNotificationHandler("publish-progress", handleProgress);
  client?.registerNotificationHandler("publish-progress", handleProgress);
  boundClient = client;
};
bindClient(useBackendWebsocketStore.getState().client);
useBackendWebsocketStore.subscribe(s => bindClient(s.client));
