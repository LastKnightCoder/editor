/**
 * 本地推理服务（node-llama-cpp）
 *
 * 替代原 Python Server 的三项本地推理职责：
 * - embed_texts：BGE-M3 GGUF 向量化
 * - rerank_texts：bge-reranker-v2-m3 GGUF 相关性重排
 * - expand_query：Qwen3 GGUF 查询扩展（JSON Schema 约束输出）
 *
 * 语义与 Python 侧保持一致：模型懒加载、路径/设备变化时重建、
 * rerank/expand 失败时返回 available=false 由上层降级。
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import type {
  Llama,
  LlamaModel,
  LlamaEmbeddingContext,
  LlamaRankingContext,
  LlamaContext,
  LlamaChatSession,
} from "node-llama-cpp";
import { getEmbeddingModelEntry, getSearchModelEntry, GgufModelEntry } from "./model-registry";

export type DevicePolicy = "auto" | "cpu" | "cuda";

export interface EmbedTextsOptions {
  modelDir?: string;
  modelName: string;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
}

export interface EmbedTextsResult {
  embeddings: number[][];
  dimensions: number;
  device: string;
}

export interface EmbeddingHealth {
  loaded: boolean;
  model_path?: string;
  model_name?: string;
  device?: string;
  dimensions?: number;
}

export interface RerankTextsOptions {
  modelDir?: string;
  modelName: string;
  batchSize?: number;
  devicePolicy?: DevicePolicy;
}

export interface RerankTextsResult {
  available: boolean;
  reason?: string;
  scores: number[];
  device?: string;
  modelName?: string;
}

export interface TypedExpansion {
  type: "lex" | "vec" | "hyde";
  text: string;
}

export interface ExpandQueryOptions {
  modelDir?: string;
  modelName: string;
  maxAlternatives?: number;
  devicePolicy?: DevicePolicy;
}

export interface ExpandQueryResult {
  available: boolean;
  reason?: string;
  device?: string;
  fallbackUsed?: boolean;
  rawPreview?: string;
  expansions: TypedExpansion[];
}

const getDefaultModelsDir = (kind: GgufModelEntry["kind"]) => {
  if (kind === "embedding") {
    return path.join(app.getPath("userData"), "embedding-models");
  }
  return path.join(app.getPath("userData"), "search-models");
};

/** 串行化推理调用，避免并发使用同一 context */
class PromiseQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

interface LoadedModel {
  model: LlamaModel;
  modelPath: string;
  device: string;
}

abstract class LlamaRuntimeBase {
  protected llama: Llama | null = null;
  protected llamaModule: typeof import("node-llama-cpp") | null = null;
  protected loaded: LoadedModel | null = null;
  protected queue = new PromiseQueue();

  protected async getLlamaInstance(): Promise<Llama> {
    if (!this.llamaModule) {
      // node-llama-cpp 为 ESM-only，主进程 CJS 产物必须动态 import
      this.llamaModule = await import("node-llama-cpp");
    }
    if (!this.llama) {
      this.llama = await this.llamaModule.getLlama();
    }
    return this.llama;
  }

  protected resolveDeviceString(): string {
    return this.llama?.gpu ? "gpu" : "cpu";
  }

  protected async ensureLoaded(
    modelPath: string,
    devicePolicy: DevicePolicy
  ): Promise<LoadedModel> {
    const llama = await this.getLlamaInstance();
    const device = devicePolicy === "cpu" ? "cpu" : this.resolveDeviceString();

    if (this.loaded && this.loaded.modelPath === modelPath && this.loaded.device === device) {
      return this.loaded;
    }

    await this.unload();
    log.info("[LocalInference] Loading model:", modelPath, "device:", device);
    const model = await llama.loadModel({
      modelPath,
      // cpu 策略下不加载 GPU 层，其余交给 llama.cpp 自动选择
      gpuLayers: devicePolicy === "cpu" ? 0 : undefined,
    });
    this.loaded = { model, modelPath, device };
    return this.loaded;
  }

  async unload(): Promise<void> {
    if (this.loaded) {
      await this.loaded.model.dispose().catch(() => undefined);
      this.loaded = null;
    }
  }
}

class EmbeddingRuntime extends LlamaRuntimeBase {
  private context: LlamaEmbeddingContext | null = null;
  private dimensions = 0;

  async embed(
    texts: string[],
    modelPath: string,
    devicePolicy: DevicePolicy
  ): Promise<EmbedTextsResult> {
    if (!texts.length) {
      return {
        embeddings: [],
        dimensions: this.dimensions,
        device: this.loaded?.device || "cpu",
      };
    }

    return this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);

      if (!this.context) {
        this.context = await model.createEmbeddingContext();
      }

      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.context.getEmbeddingFor(text);
        embeddings.push(Array.from(embedding.vector));
      }

      if (!this.dimensions && embeddings.length) {
        this.dimensions = embeddings[0].length;
      }
      return {
        embeddings,
        dimensions: this.dimensions,
        device: this.loaded?.device || "cpu",
      };
    });
  }

  health(): EmbeddingHealth {
    return {
      loaded: !!this.loaded,
      model_path: this.loaded?.modelPath,
      model_name: this.loaded ? this.loaded.modelPath.split(path.sep).slice(-2)[0] : undefined,
      device: this.loaded?.device || "cpu",
      dimensions: this.dimensions,
    };
  }

  async unload(): Promise<void> {
    this.context?.dispose();
    this.context = null;
    await super.unload();
  }

  /** 仅确保模型已加载（预热，同时建立 embedding context） */
  async warmup(modelPath: string, devicePolicy: DevicePolicy): Promise<void> {
    await this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);
      if (!this.context) {
        this.context = await model.createEmbeddingContext();
      }
    });
  }
}

class RerankRuntime extends LlamaRuntimeBase {
  private context: LlamaRankingContext | null = null;

  async rerank(
    query: string,
    texts: string[],
    modelPath: string,
    devicePolicy: DevicePolicy
  ): Promise<{ scores: number[]; device: string }> {
    if (!texts.length) {
      return { scores: [], device: this.loaded?.device || "cpu" };
    }

    return this.queue.run(async () => {
      const { model } = await this.ensureLoaded(modelPath, devicePolicy);
      if (!this.context) {
        this.context = await model.createRankingContext();
      }
      const scores = await this.context.rankAll(query, texts);
      return {
        scores: scores.map(score => Number(score)),
        device: this.loaded?.device || "cpu",
      };
    });
  }

  async unload(): Promise<void> {
    this.context?.dispose();
    this.context = null;
    await super.unload();
  }
}

const EXPANSION_JSON_SCHEMA = {
  type: "object",
  properties: {
    expansions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["lex", "vec", "hyde"] },
          text: { type: "string" },
        },
        required: ["type", "text"],
      },
    },
  },
  required: ["expansions"],
} as const;

function stripThinkBlock(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function sanitizeExpansions(query: string, payload: unknown): TypedExpansion[] {
  const raw = (payload as { expansions?: unknown } | null)?.expansions;
  if (!Array.isArray(raw)) {
    return [];
  }

  const validTypes = new Set(["lex", "vec", "hyde"]);
  const byType = new Map<string, string>();
  const seen = new Set([query.trim().toLowerCase()]);

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const expType = (item as { type?: unknown }).type;
    const expText = (item as { text?: unknown }).text;
    if (typeof expType !== "string" || !validTypes.has(expType) || typeof expText !== "string") {
      continue;
    }
    const normalized = expText.trim();
    if (!normalized) {
      continue;
    }
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    if (!byType.has(expType)) {
      byType.set(expType, normalized);
    }
  }

  const results: TypedExpansion[] = [];
  for (const expType of ["lex", "vec", "hyde"] as const) {
    const text = byType.get(expType);
    if (text) {
      results.push({ type: expType, text });
    }
  }
  return results;
}

function buildFallbackExpansions(query: string, maxAlternatives: number): TypedExpansion[] {
  const safeMax = Math.max(1, Math.min(3, maxAlternatives));
  const tokens = query
    .toLowerCase()
    .split(/[^\w\u4e00-\u9fff]+/)
    .filter(token => token && token.length > 1);
  const keywordTail = (tokens.length ? tokens : [query.toLowerCase()])
    .slice(0, safeMax + 1)
    .join(" ");

  const candidates: TypedExpansion[] = [
    { type: "lex", text: `${query} ${keywordTail} 关键术语`.trim() },
    { type: "vec", text: `${query} 的核心概念与关联知识` },
    {
      type: "hyde",
      text: `这是一段关于 ${query} 的知识说明，包含定义、关键要点、应用场景与示例。`,
    },
  ];

  const seen = new Set([query.trim().toLowerCase()]);
  return candidates.filter(item => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

class ExpansionRuntime extends LlamaRuntimeBase {
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;

  private buildPrompt(query: string, maxAlternatives: number): string {
    const safeMax = Math.max(1, Math.min(3, maxAlternatives));
    return (
      "你是本地检索系统的查询扩展器。\n" +
      "请基于用户问题输出 JSON，对象格式必须是：\n" +
      '{"expansions":[{"type":"lex","text":"..."},{"type":"vec","text":"..."},{"type":"hyde","text":"..."}]}\n' +
      "约束：\n" +
      "1) type 只能是 lex / vec / hyde\n" +
      "2) text 必须与原问题语义相关，避免重复原句\n" +
      `3) expansions 最多返回 ${safeMax + 1} 项，优先覆盖三种 type\n` +
      "4) 只输出 JSON，不要输出解释文字\n" +
      `用户问题：${query}\n`
    );
  }

  async expand(
    query: string,
    modelPath: string,
    maxAlternatives: number,
    devicePolicy: DevicePolicy
  ): Promise<ExpandQueryResult> {
    const normalizedQuery = (query || "").trim();
    if (!normalizedQuery) {
      return { available: false, reason: "empty query", expansions: [] };
    }

    try {
      return await this.queue.run(async () => {
        const llama = await this.getLlamaInstance();
        const { model } = await this.ensureLoaded(modelPath, devicePolicy);

        if (!this.llamaModule) {
          await this.getLlamaInstance();
        }
        if (!this.context || !this.session) {
          this.context = await model.createContext();
          this.session = new this.llamaModule!.LlamaChatSession({
            contextSequence: this.context.getSequence(),
          });
        }

        let rawOutput = "";
        try {
          rawOutput = await this.session.prompt(
            this.buildPrompt(normalizedQuery, maxAlternatives),
            {
              maxTokens: 256,
              temperature: 0.7,
              topP: 0.8,
              topK: 20,
              grammar: new this.llamaModule!.LlamaJsonSchemaGrammar(llama, EXPANSION_JSON_SCHEMA),
            }
          );
        } catch (error) {
          log.warn("[LocalInference] JSON Schema 生成失败，降级为自由生成:", error);
          rawOutput = await this.session.prompt(
            this.buildPrompt(normalizedQuery, maxAlternatives),
            {
              maxTokens: 256,
              temperature: 0.7,
              topP: 0.8,
              topK: 20,
            }
          );
        }

        const normalizedText = stripThinkBlock(rawOutput);
        let payload: unknown;
        try {
          payload = JSON.parse(normalizedText);
        } catch {
          const match = normalizedText.match(/\{[\s\S]*\}/);
          payload = match ? JSON.parse(match[0]) : null;
        }

        const expansions = sanitizeExpansions(normalizedQuery, payload);
        if (!expansions.length) {
          const fallback = buildFallbackExpansions(normalizedQuery, maxAlternatives);
          if (fallback.length) {
            return {
              available: true,
              device: this.loaded?.device,
              fallbackUsed: true,
              rawPreview: normalizedText.slice(0, 220),
              expansions: fallback,
            };
          }
          return {
            available: false,
            reason: "query expansion model returned empty result",
            rawPreview: normalizedText.slice(0, 220),
            expansions: [],
          };
        }

        return {
          available: true,
          device: this.loaded?.device,
          fallbackUsed: false,
          rawPreview: normalizedText.slice(0, 220),
          expansions,
        };
      });
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        expansions: [],
      };
    }
  }

  async unload(): Promise<void> {
    try {
      await this.session?.dispose();
    } catch {
      // 忽略释放失败
    }
    this.session = null;
    this.context?.dispose();
    this.context = null;
    await super.unload();
  }
}

class LocalInferenceService {
  readonly embedding = new EmbeddingRuntime();
  readonly rerank = new RerankRuntime();
  readonly expansion = new ExpansionRuntime();

  private resolveModelPath(
    kind: GgufModelEntry["kind"],
    modelDir: string | undefined,
    entry: GgufModelEntry
  ): string {
    const dir = modelDir || getDefaultModelsDir(kind);
    return path.join(dir, entry.name, entry.file);
  }

  /**
   * 检查本地 embedding 模型文件是否已下载（供索引队列前置检查，
   * 避免模型缺失时逐条任务报错）
   */
  isEmbeddingModelReady(options: { modelDir?: string; modelName: string }): boolean {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      return false;
    }
    return fs.existsSync(this.resolveModelPath("embedding", options.modelDir, entry));
  }

  async embedTexts(texts: string[], options: EmbedTextsOptions): Promise<EmbedTextsResult> {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      throw new Error(`未知的本地 embedding 模型: ${options.modelName}`);
    }
    const modelPath = this.resolveModelPath("embedding", options.modelDir, entry);
    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `Embedding 模型不存在: ${modelPath}，请在「设置 → 向量模型」中下载后自动继续索引`
      );
    }
    return this.embedding.embed(texts, modelPath, options.devicePolicy || "auto");
  }

  async embeddingHealth(options: {
    modelDir?: string;
    modelName: string;
    devicePolicy?: DevicePolicy;
  }): Promise<{ success: boolean; health: EmbeddingHealth; error?: string }> {
    const entry = getEmbeddingModelEntry(options.modelName);
    if (!entry) {
      return {
        success: false,
        health: this.embedding.health(),
        error: `未知模型: ${options.modelName}`,
      };
    }

    const modelPath = this.resolveModelPath("embedding", options.modelDir, entry);
    if (fs.existsSync(modelPath)) {
      try {
        await this.embedding.warmup(modelPath, options.devicePolicy || "auto");
      } catch (error) {
        return {
          success: false,
          health: this.embedding.health(),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true, health: this.embedding.health() };
  }

  async rerankTexts(
    query: string,
    texts: string[],
    options: RerankTextsOptions
  ): Promise<RerankTextsResult> {
    const entry = getSearchModelEntry(options.modelName);
    if (!entry || entry.kind !== "reranker") {
      return { available: false, reason: `未知的本地重排模型: ${options.modelName}`, scores: [] };
    }

    const modelPath = this.resolveModelPath(entry.kind, options.modelDir, entry);
    if (!fs.existsSync(modelPath)) {
      return { available: false, reason: `重排模型不存在: ${modelPath}`, scores: [] };
    }

    try {
      const result = await this.rerank.rerank(
        query,
        texts.map(text => String(text)),
        modelPath,
        options.devicePolicy || "auto"
      );
      return {
        available: true,
        scores: result.scores,
        device: result.device,
        modelName: options.modelName,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
        scores: [],
      };
    }
  }

  async expandQuery(query: string, options: ExpandQueryOptions): Promise<ExpandQueryResult> {
    const entry = getSearchModelEntry(options.modelName);
    if (!entry || entry.kind !== "query_expander") {
      return {
        available: false,
        reason: `未知的查询扩展模型: ${options.modelName}`,
        expansions: [],
      };
    }

    const modelPath = this.resolveModelPath(entry.kind, options.modelDir, entry);
    if (!fs.existsSync(modelPath)) {
      return {
        available: false,
        reason: `查询扩展模型不存在: ${modelPath}`,
        expansions: [],
      };
    }

    return this.expansion.expand(
      query,
      modelPath,
      Math.max(1, Math.min(3, options.maxAlternatives || 2)),
      options.devicePolicy || "auto"
    );
  }
}

const localInference = new LocalInferenceService();
export default localInference;
