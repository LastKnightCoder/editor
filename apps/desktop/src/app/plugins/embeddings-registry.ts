import type { Disposable, EmbeddingProviderDefinition, PluginContext } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type {
  EmbeddingsProviderInfo,
  EmbeddingsRendererRequest,
} from "../../../shared/embeddings-renderer";

export type { EmbeddingsRendererRequest };

interface Registration {
  context: PluginContext;
  definition: EmbeddingProviderDefinition;
}

function validateVectors(result: unknown, texts: readonly string[]): number[][] {
  if (!Array.isArray(result) || result.length !== texts.length)
    throw new Error("嵌入结果条数必须与输入文本一致");
  const vectors: number[][] = [];
  for (const vector of result) {
    if (!Array.isArray(vector) || vector.length === 0)
      throw new Error("嵌入结果必须是非空向量数组");
    if (vectors.length > 0 && vector.length !== vectors[0].length)
      throw new Error("同一批嵌入结果的维度必须一致");
    for (const value of vector)
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("嵌入向量的每个值都必须是有限数字");
    vectors.push(Array.from(vector));
  }
  return vectors;
}

/** 嵌入提供方只在渲染进程执行，主进程经 relay 转发请求，这里按插件定位实现。 */
export class RendererEmbeddingsRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly listeners = new Set<() => void>();
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  notifyChanged = () => {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("嵌入能力变更通知失败", error);
      }
    }
  };
  register(context: PluginContext, definition: EmbeddingProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("嵌入提供方已注册");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    this.notifyChanged();
    const release = () => {
      if (this.registrations.get(context.pluginId) !== registration) return;
      this.registrations.delete(context.pluginId);
      this.notifyChanged();
    };
    context.signal.addEventListener("abort", release, { once: true });
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", release);
        release();
      },
    };
  }
  has(pluginId: string): boolean {
    return this.registrations.has(pluginId);
  }
  maxBatchSize(pluginId: string): number | undefined {
    return this.registrations.get(pluginId)?.definition.maxBatchSize;
  }
  providers(): EmbeddingsProviderInfo[] {
    return [...this.registrations.entries()].map(([pluginId, { definition }]) => ({
      pluginId,
      ...(definition.maxBatchSize !== undefined ? { maxBatchSize: definition.maxBatchSize } : {}),
    }));
  }
  async execute(request: EmbeddingsRendererRequest, callSignal: AbortSignal): Promise<number[][]> {
    callSignal.throwIfAborted();
    const registration = this.registrations.get(request.pluginId);
    if (!registration || registration.context.signal.aborted) throw new Error("嵌入插件未激活");
    if (
      !Array.isArray(request.texts) ||
      request.texts.length === 0 ||
      request.texts.some(text => typeof text !== "string" || !text.trim())
    )
      throw new Error("嵌入请求的 texts 必须是非空字符串数组");
    const max = registration.definition.maxBatchSize;
    if (max !== undefined && request.texts.length > max)
      throw new Error(`单批文本数量 ${request.texts.length} 超过提供方上限 ${max}，请分批请求`);
    callSignal.throwIfAborted();
    const signal = AbortSignal.any([callSignal, registration.context.signal]);
    const instance = registration.definition.create(copyJson(request.config), request.modelId);
    if (typeof instance?.embed !== "function") throw new Error("嵌入提供方缺少 embed 方法");
    return validateVectors(await instance.embed([...request.texts], signal), request.texts);
  }
}

export const rendererEmbeddingsRegistry = new RendererEmbeddingsRegistry();
