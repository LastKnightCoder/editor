/**
 * 本地 embedding（node-llama-cpp / GGUF）
 *
 * 替代原 python-embedding（spawn python-server.exe + WebSocket RPC）：
 * 进程内直接加载 GGUF 模型，模型目录与桌面端共享。
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { getAppDir } from "../utils/path.js";
import { readSettings } from "../utils/settings.js";

const require = globalThis.require as NodeRequire;

export interface EmbeddingConfig {
  modelDir: string;
  modelName: string;
  file: string;
  dimensions: number;
  distance: number;
}

/** 与桌面端 model-registry 保持一致的 GGUF 文件映射 */
const GGUF_FILES: Record<string, string> = {
  "bge-m3": "bge-m3-Q8_0.gguf",
};

/* eslint-disable @typescript-eslint/no-explicit-any */

function resolveNodeLlamaCpp(): any | null {
  // 开发环境：正常解析 node_modules
  try {
    return require("node-llama-cpp");
  } catch {
    // 打包进桌面应用时：CLI 位于 resources/cli，原生模块在 app.asar.unpacked
    try {
      // 打包进桌面应用（Electron）时 resourcesPath 才存在
      const resourcesPath = (process as any).resourcesPath as string | undefined;
      if (!resourcesPath) return null;
      const unpacked = join(resourcesPath, "app.asar.unpacked", "node_modules", "node-llama-cpp");
      return require(unpacked);
    } catch {
      return null;
    }
  }
}

export function getEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const settings = readSettings();
    const ep = (settings as any).embeddingProvider;
    if (!ep) return null;

    const configId = ep.currentConfigId;
    const configs = ep.configs as any[] | undefined;
    if (!configs || configs.length === 0) return null;

    const config = configId ? configs.find((c: any) => c.id === configId) : configs[0];
    if (!config) return null;

    const modelName = config.currentModel || "bge-m3";
    const models = config.models as any[] | undefined;
    const modelInfo = models?.find((m: any) => m.name === modelName);

    const localModelDir = config.localModelDir || join(getAppDir(), "embedding-models");

    return {
      modelDir: localModelDir,
      modelName,
      file: GGUF_FILES[modelName] || `${modelName}.gguf`,
      dimensions: modelInfo?.contextLength || 1024,
      distance: modelInfo?.distance || 0.6,
    };
  } catch {
    return null;
  }
}

/**
 * 检查本地 embedding 是否可用（依赖 + 模型文件）
 */
export function isEmbeddingAvailable(): boolean {
  const config = getEmbeddingConfig();
  if (!config) return false;
  const modelPath = join(config.modelDir, config.modelName, config.file);
  return existsSync(modelPath);
}

let embeddingContext: any = null;
let loadedModelPath: string | null = null;

async function ensureContext(modelPath: string): Promise<any> {
  if (embeddingContext && loadedModelPath === modelPath) {
    return embeddingContext;
  }

  if (embeddingContext) {
    await embeddingContext.dispose?.().catch?.(() => undefined);
    embeddingContext = null;
    loadedModelPath = null;
  }

  const mod = resolveNodeLlamaCpp();
  if (!mod) {
    throw new Error("node-llama-cpp 不可用，无法执行本地向量化");
  }

  const llama = await mod.getLlama();
  const model = await llama.loadModel({ modelPath });
  embeddingContext = await model.createEmbeddingContext();
  loadedModelPath = modelPath;
  return embeddingContext;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) {
    return [];
  }

  const config = getEmbeddingConfig();
  if (!config) {
    throw new Error("No embedding config found in settings");
  }

  const modelPath = join(config.modelDir, config.modelName, config.file);
  if (!existsSync(modelPath)) {
    throw new Error(`Embedding model not found: ${modelPath}，请先在应用设置中下载本地向量模型`);
  }

  const context = await ensureContext(modelPath);
  const embeddings: number[][] = [];
  for (const text of texts) {
    const embedding = await context.getEmbeddingFor(text);
    embeddings.push(Array.from(embedding.vector));
  }
  return embeddings;
}

export function closeEmbeddingRuntime(): void {
  if (embeddingContext) {
    void embeddingContext.dispose?.().catch?.(() => undefined);
    embeddingContext = null;
    loadedModelPath = null;
  }
}
