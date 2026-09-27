/**
 * pi-ai 运行时模块（单发路径 + provider 注册中心）。
 * 渲染端设置经 userSettingModule 快照/变更通知流入，syncProviders 维护 pi Models 注册表；
 * 单发请求走 streamSimple，事件（含 pi 原生 partial 全量快照）原样经 IPC 推回渲染进程，
 * 渲染端直接消费 pi 的快照/delta 语义，不做桥接层语义转换。
 * M2 的会话 harness（PiSessionHost）复用本模块的注册表。
 */
import { ipcMain } from "electron";
import { normalizeContext } from "@earendil-works/pi-ai";
import userSettingModule from "./user-setting";
import { rewriteThinkTagStream } from "./think-stream-rewriter";
import {
  createProviderRegistry,
  buildSingleShotContext,
  listCatalogModels,
  listCatalogProviders,
  resolveThinkingLevels,
  resolveV2Providers,
  type ProviderRegistry,
} from "./pi-ai-runtime-core";
import { discoverProviderModels, ModelDiscoveryError } from "./pi-model-discovery";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
import type { LLMProviderSetting, PiSingleShotOutcome, PiSingleShotRequest } from "@/types/pi-llm";

class PiAiRuntimeModule {
  private static registry: ProviderRegistry | null = null;
  private static readonly activeShots = new Map<string, AbortController>();

  public static init() {
    PiAiRuntimeModule.registry = createProviderRegistry();

    userSettingModule.onSettingChanged(({ newSetting }) => {
      void PiAiRuntimeModule.syncProviders(resolveV2Providers(newSetting));
    });
    void userSettingModule.getSettingSnapshot().then(async setting => {
      await PiAiRuntimeModule.syncProviders(resolveV2Providers(setting));
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
        return { ok: false, error: errorMessage(error), providers: [] };
      }
    });
    ipcMain.handle("pi-ai:catalog-models", async (_event, { builtin }: { builtin: string }) => {
      try {
        return { ok: true, models: await listCatalogModels(builtin) };
      } catch (error) {
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
          return { ok: false, error: errorMessage(error), levels: [], fromCatalog: false };
        }
      }
    );
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
    const registry = PiAiRuntimeModule.registry;
    if (!registry) return { ok: false, error: "pi-ai runtime not initialized" };

    const model = registry.resolveModel(request.providerId, request.modelId);
    if (!model) return { ok: false, error: `模型未注册：${request.providerId}/${request.modelId}` };

    const abortController = new AbortController();
    PiAiRuntimeModule.activeShots.set(request.requestId, abortController);
    try {
      const stream = registry.models.streamSimple(
        model,
        normalizeContext(buildSingleShotContext(request, request.providerId, request.modelId)),
        {
          ...(request.thinking && request.thinking !== "off"
            ? { reasoning: request.thinking }
            : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          signal: abortController.signal,
        }
      );
      const events = registry.needsThinkStrip(request.providerId, request.modelId)
        ? rewriteThinkTagStream(stream)
        : stream;
      for await (const event of events) {
        if (!sender.isDestroyed())
          sender.send("pi-ai-stream-event", { requestId: request.requestId, ...event });
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      PiAiRuntimeModule.activeShots.delete(request.requestId);
    }
  }
}

export default PiAiRuntimeModule;
