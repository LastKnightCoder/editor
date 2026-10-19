/**
 * 发布运行态全局 store —— 进度与结果不随发布页卸载丢失。
 *
 * 发布在主进程执行，离开页面（后退弹栈 / LRU 卸载）后仍会跑完；运行态若留在组件内，
 * 回来即变回「就绪」且可再次点发布（主进程无并发锁）。故 run 与进度监听提到模块级：
 * 进度 handler 随 WebSocket client 常驻注册，不受页面 Activity 隐藏停驻影响；
 * start() 在 running 时直接忽略，保证同一时刻只有一次发布。
 * 结束时经 notify 回报一次（后台任务结果属 Notification 而非 Toast，D-038）。
 */

import { create } from "zustand";
import type { NotificationAction } from "@tau/ui";
import { appNotify } from "@/features/notifications/notify";
import { EPublishProvider } from "@/stores/useSettingStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import { executePublish } from "@/commands";
import { exportPublishOutput } from "@/commands/publish";
import { openPage } from "@/services/page-navigation";
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

/** 最近一次发布参数：失败通知的「重试」按原参数重跑 */
let lastParams: PublishRunParams | null = null;

export const usePublishRunStore = create<PublishRunStore>()((set, get) => ({
  run: { kind: "idle" },
  finishSeq: 0,
  start: async params => {
    if (get().run.kind === "running") return;
    lastParams = params;
    const { active, providerConfig, publish, appearance, targetDir = "" } = params;
    const startedAt = Date.now();
    set({ run: { kind: "running", startedAt, progress: null } });
    let next: RunState;
    try {
      if (!publish.site.templateId) throw new Error("请先在站点设置中选择模板插件");
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

const NOTICE_ID = "publish-run";

/**
 * 结束时通知一次：用户可能已离开发布页，结果卡看不到。同一 id 原位替换，
 * 连续发布只留最新一条；失败类常驻并可重试，成功类按默认时长自动关。
 */
function notifyFinished(run: RunState) {
  const view: NotificationAction = { label: "查看详情", onClick: () => openPage("publish") };
  const retry: NotificationAction = {
    label: "重试",
    primary: true,
    onClick: () => {
      if (lastParams) void usePublishRunStore.getState().start(lastParams);
    },
  };
  const seconds = (ms: number) => Math.max(1, Math.round(ms / 1000));

  if (run.kind === "done") {
    const { uploaded, failed } = run.result;
    if (failed.length === 0) {
      appNotify({
        id: NOTICE_ID,
        title: "站点已发布",
        body: `${uploaded.length} 个文件已上传 · 用时 ${seconds(run.duration)} 秒`,
        source: "发布",
        tone: "ok",
        actions: [view],
      });
    } else {
      appNotify({
        id: NOTICE_ID,
        title: "发布完成，部分文件失败",
        body: `${failed.length} 个文件上传失败，其余 ${uploaded.length} 个已上传`,
        source: "发布",
        tone: "danger",
        sticky: true,
        actions: [view, retry],
      });
    }
  } else if (run.kind === "exported") {
    appNotify({
      id: NOTICE_ID,
      title: "静态站点已导出",
      body: run.targetDir,
      source: "发布",
      tone: "ok",
      actions: [view],
    });
  } else if (run.kind === "error") {
    appNotify({
      id: NOTICE_ID,
      title: "发布失败",
      body: run.message,
      source: "发布",
      tone: "danger",
      sticky: true,
      actions: [view, retry],
    });
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
