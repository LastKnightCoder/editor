/**
 * pi-ai 运行时模块（单发路径 + provider 注册中心）。
 * 渲染端设置经 userSettingModule 快照/变更通知流入，syncProviders 维护 pi Models 注册表；
 * 单发请求走 streamSimple，事件（含 pi 原生 partial 全量快照）原样经 IPC 推回渲染进程，
 * 渲染端直接消费 pi 的快照/delta 语义，不做桥接层语义转换。
 * 会话 harness（PiSessionHost）共用 provider 装配与模型出站契约。
 */
import { ipcMain } from "electron";
import { type AssistantMessage, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import userSettingModule from "./user-setting";
import { executeSingleShot } from "./pi-ai-single-shot";
import {
  applyCatalogCostFills,
  collectCatalogCostFills,
  createProviderRegistry,
  listCatalogModels,
  listCatalogProviders,
  resolveThinkingLevels,
  resolveV2Providers,
  type ProviderRegistry,
} from "./pi-ai-runtime-core";
import { discoverProviderModels, ModelDiscoveryError } from "./pi-model-discovery";
import modelUsageModule from "./model-usage";
import type { RecordUsage } from "./model-usage/trackers";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
import type { LLMProviderSetting, PiSingleShotOutcome, PiSingleShotRequest } from "@/types/pi-llm";

class PiAiRuntimeModule {
  private static registry: ProviderRegistry | null = null;
  private static readonly activeShots = new Map<string, AbortController>();
  /** 启动时首次 provider 同步：后台任务可能早于它发起，请求发起前先等 */
  private static initialSync: Promise<void> = Promise.resolve();

  public static init() {
    PiAiRuntimeModule.registry = createProviderRegistry();

    userSettingModule.onSettingChanged(({ newSetting }) => {
      void PiAiRuntimeModule.syncProviders(resolveV2Providers(newSetting));
      void PiAiRuntimeModule.backfillCatalogCosts(resolveV2Providers(newSetting));
    });
    PiAiRuntimeModule.initialSync = userSettingModule.getSettingSnapshot().then(async setting => {
      await PiAiRuntimeModule.syncProviders(resolveV2Providers(setting));
      void PiAiRuntimeModule.backfillCatalogCosts(resolveV2Providers(setting));
    });

    ipcMain.handle("pi-ai:single-shot", async (event, request: PiSingleShotRequest) => {
      return PiAiRuntimeModule.runSingleShot(event.sender, request);
    });
    ipcMain.handle("pi-ai:cancel", async (_event, { requestId }: { requestId: string }) => {
      PiAiRuntimeModule.activeShots.get(requestId)?.abort();
      return true;
    });
    // 内置目录查询（纯读、不联网）：设置页据此选服务商、勾模型、按模型能力给推理档位
    ipcMain.handle("pi-ai:catalog-providers", async () => {
      try {
        return { ok: true, providers: await listCatalogProviders() };
      } catch (error) {
        console.error("[PiAiRuntime] catalog-providers error:", error);
        return { ok: false, error: errorMessage(error), providers: [] };
      }
    });
    ipcMain.handle("pi-ai:catalog-models", async (_event, { builtin }: { builtin: string }) => {
      try {
        return { ok: true, models: await listCatalogModels(builtin) };
      } catch (error) {
        console.error("[PiAiRuntime] catalog-models error:", error);
        return { ok: false, error: errorMessage(error), models: [] };
      }
    });
    // 实时拉取服务商模型列表（联网，仅发往用户配置的 baseUrl）：目录外服务与目录滞后时用
    ipcMain.handle(
      "pi-ai:discover-models",
      async (_event, { provider }: { provider: LLMProviderSetting }) => {
        try {
          return { ok: true, models: await discoverProviderModels(provider) };
        } catch (error) {
          if (!(error instanceof ModelDiscoveryError)) {
            console.error("[PiAiRuntime] discover-models error:", error);
          }
          return { ok: false, error: errorMessage(error), models: [] };
        }
      }
    );
    ipcMain.handle(
      "pi-ai:thinking-levels",
      async (_event, { provider, modelId }: { provider: LLMProviderSetting; modelId: string }) => {
        try {
          return { ok: true, ...(await resolveThinkingLevels(provider, modelId)) };
        } catch (error) {
          console.error("[PiAiRuntime] thinking-levels error:", error);
          return { ok: false, error: errorMessage(error), levels: [], fromCatalog: false };
        }
      }
    );
  }

  /** 该模型是否按用户改过的单价计费（会话路径的用量记录据此标 custom） */
  public static isCustomPriced(providerId: string, modelId: string): boolean {
    return PiAiRuntimeModule.registry?.hasCustomCost(providerId, modelId) ?? false;
  }

  /**
   * 目录价自动填入：已配置但还没有单价的模型，按内置目录价写进设置，之后可在模型编辑里改。
   * 只补空缺不覆盖；写入走设置模块广播，各窗口按远端设置应用、不回灌。
   * 补完后再次触发的设置变更里已无空缺，不会循环。
   */
  private static backfilling = false;
  private static async backfillCatalogCosts(providers: LLMProviderSetting[]) {
    if (PiAiRuntimeModule.backfilling) return;
    if (!providers.some(provider => provider.models.some(model => !model.cost))) return;
    PiAiRuntimeModule.backfilling = true;
    try {
      const fills = await collectCatalogCostFills(providers);
      if (fills.size === 0) return;
      // 查目录是异步的：写回前取最新设置，只补仍然空缺的，避免覆盖期间的用户修改
      let updated = false;
      await userSettingModule.updateSetting(latest => {
        const next = applyCatalogCostFills(resolveV2Providers(latest), fills);
        if (!next) return latest;
        updated = true;
        return { ...latest, llmProviders: next };
      });
      if (updated) console.info(`[PiAiRuntime] 已为 ${fills.size} 个模型填入目录单价`);
    } catch (error) {
      console.error("[PiAiRuntime] 填入目录单价失败:", error);
    } finally {
      PiAiRuntimeModule.backfilling = false;
    }
  }

  private static async syncProviders(providers: LLMProviderSetting[] | undefined) {
    if (!PiAiRuntimeModule.registry) return;
    try {
      await PiAiRuntimeModule.registry.syncProviders(Array.isArray(providers) ? providers : []);
    } catch (error) {
      console.error("[PiAiRuntime] syncProviders error:", error);
    }
  }

  private static async runSingleShot(
    sender: Electron.WebContents,
    request: PiSingleShotRequest
  ): Promise<PiSingleShotOutcome> {
    const abortController = new AbortController();
    PiAiRuntimeModule.activeShots.set(request.requestId, abortController);
    try {
      await PiAiRuntimeModule.initialSync;
      if (abortController.signal.aborted) return { ok: false, aborted: true };
      const outcome = await PiAiRuntimeModule.stream(request, abortController.signal, event => {
        if (!sender.isDestroyed())
          sender.send("pi-ai-stream-event", { requestId: request.requestId, ...event });
      });
      return { ok: outcome.ok, aborted: outcome.aborted, error: outcome.error };
    } finally {
      PiAiRuntimeModule.activeShots.delete(request.requestId);
    }
  }

  /**
   * 主进程内部单发（不经 IPC）：VL 断句优化、图片描述等后台任务用，
   * 与渲染端单发共用注册表与用量采集。流内错误以 ok=false 返回，不抛出。
   */
  public static async complete(
    request: Omit<PiSingleShotRequest, "requestId">,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; text: string; message: AssistantMessage | null; error?: string }> {
    await PiAiRuntimeModule.initialSync.catch(() => undefined);
    const outcome = await PiAiRuntimeModule.stream({ ...request, requestId: "" }, signal);
    if (!outcome.ok || outcome.aborted || signal?.aborted) {
      return {
        ok: false,
        text: "",
        message: null,
        error: outcome.error ?? (outcome.aborted || signal?.aborted ? "已取消" : "模型请求失败"),
      };
    }
    const text =
      outcome.message?.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("\n\n") ?? "";
    return { ...outcome, text };
  }

  public static async execute(
    request: PiSingleShotRequest,
    signal: AbortSignal,
    onEvent: (event: AssistantMessageEvent) => void,
    record: RecordUsage
  ) {
    await PiAiRuntimeModule.initialSync;
    signal.throwIfAborted();
    return PiAiRuntimeModule.stream(request, signal, onEvent, record);
  }

  public static async capacity(providerId: string, modelId: string) {
    await PiAiRuntimeModule.initialSync;
    const model = PiAiRuntimeModule.registry?.resolveModel(providerId, modelId);
    if (!model) throw new Error("AI_NOT_CONFIGURED：模型配置已不可用");
    return { contextWindow: model.contextWindow, maxTokens: model.maxTokens };
  }

  private static async stream(
    request: PiSingleShotRequest,
    signal: AbortSignal | undefined,
    onEvent?: (event: AssistantMessageEvent) => void,
    record: RecordUsage = input => modelUsageModule.record(input)
  ): Promise<{ ok: boolean; message: AssistantMessage | null; error?: string; aborted?: boolean }> {
    const registry = PiAiRuntimeModule.registry;
    if (!registry) return { ok: false, message: null, error: "pi-ai runtime not initialized" };

    try {
      return await executeSingleShot(registry, request, record, signal, onEvent);
    } catch (error) {
      return { ok: false, message: null, error: errorMessage(error), aborted: signal?.aborted };
    }
  }
}

export default PiAiRuntimeModule;
