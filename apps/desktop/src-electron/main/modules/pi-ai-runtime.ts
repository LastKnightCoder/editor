/**
 * pi-ai 运行时模块（单发路径 + provider 注册中心）。
 * 渲染端设置经 userSettingModule 快照/变更通知流入，syncProviders 维护 pi Models 注册表；
 * 单发请求走 streamSimple，事件经 IPC 推回渲染进程（剥离 partial 快照，done 保留最终 message）。
 * M2 的会话 harness（PiSessionHost）复用本模块的注册表。
 */
import { ipcMain } from "electron";
import { normalizeContext } from "@earendil-works/pi-ai";
import userSettingModule from "./user-setting";
import { rewriteThinkTagStream } from "./think-stream-rewriter";
import {
  createProviderRegistry,
  buildSingleShotContext,
  type ProviderRegistry,
} from "./pi-ai-runtime-core";
import type { LLMProviderSetting, PiSingleShotOutcome, PiSingleShotRequest } from "@/types/pi-llm";

class PiAiRuntimeModule {
  private static registry: ProviderRegistry | null = null;
  private static readonly activeShots = new Map<string, AbortController>();

  public static init() {
    PiAiRuntimeModule.registry = createProviderRegistry();

    userSettingModule.onSettingChanged(({ newSetting }) => {
      void PiAiRuntimeModule.syncProviders(newSetting?.llmProviders);
    });
    void userSettingModule.getSettingSnapshot().then(setting => {
      PiAiRuntimeModule.syncProviders(setting?.llmProviders);
    });

    ipcMain.handle("pi-ai:single-shot", async (event, request: PiSingleShotRequest) => {
      return PiAiRuntimeModule.runSingleShot(event.sender, request);
    });
    ipcMain.handle("pi-ai:cancel", async (_event, { requestId }: { requestId: string }) => {
      PiAiRuntimeModule.activeShots.get(requestId)?.abort();
      return true;
    });
  }

  private static syncProviders(providers: LLMProviderSetting[] | undefined) {
    if (!PiAiRuntimeModule.registry) return;
    try {
      PiAiRuntimeModule.registry.syncProviders(Array.isArray(providers) ? providers : []);
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
      for await (const rawEvent of events) {
        // done/error 变体不带 partial；其余事件剥离 partial 快照（体积大且单发场景不需要，done 自带最终 message）
        const { partial: _partial, ...event } = rawEvent as typeof rawEvent & { partial?: unknown };
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
