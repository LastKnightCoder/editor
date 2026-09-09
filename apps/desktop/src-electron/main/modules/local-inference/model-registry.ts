/**
 * 本地推理模型注册表
 *
 * 所有本地模型统一使用 GGUF 格式（llama.cpp 生态），
 * 模型文件保存于 <modelsDir>/<name>/<file>
 */

export type LocalModelKind = "embedding" | "reranker" | "query_expander";

import path from "node:path";

export interface GgufModelEntry {
  name: string;
  kind: LocalModelKind;
  label: string;
  description: string;
  size: string;
  recommended?: boolean;
  /** 输出向量维度（仅 embedding） */
  dimensions?: number;
  /** 本地保存的 GGUF 文件名 */
  file: string;
  modelscope: string;
  modelscopePath: string;
  huggingface: string;
  huggingfacePath: string;
}

export const EMBEDDING_MODELS: Record<string, GgufModelEntry> = {
  "bge-m3": {
    name: "bge-m3",
    kind: "embedding",
    label: "BAAI/bge-m3",
    description: "多语言通用向量模型（本地离线，GGUF Q8_0）",
    size: "~635MB",
    dimensions: 1024,
    recommended: true,
    file: "bge-m3-Q8_0.gguf",
    modelscope: "gpustack/bge-m3-GGUF",
    modelscopePath: "bge-m3-Q8_0.gguf",
    huggingface: "ggml-org/bge-m3-Q8_0-GGUF",
    huggingfacePath: "bge-m3-q8_0.gguf",
  },
};

export const SEARCH_MODELS: Record<string, GgufModelEntry> = {
  "qwen3-0.6b": {
    name: "qwen3-0.6b",
    kind: "query_expander",
    label: "Qwen3-0.6B",
    description: "本地查询扩展生成模型（GGUF Q8_0，支持非思考模式）",
    size: "~610MB",
    recommended: true,
    file: "Qwen3-0.6B-Q8_0.gguf",
    modelscope: "Qwen/Qwen3-0.6B-GGUF",
    modelscopePath: "Qwen3-0.6B-Q8_0.gguf",
    huggingface: "Qwen/Qwen3-0.6B-GGUF",
    huggingfacePath: "Qwen3-0.6B-Q8_0.gguf",
  },
  "qwen2.5-0.5b-instruct": {
    name: "qwen2.5-0.5b-instruct",
    kind: "query_expander",
    label: "Qwen2.5-0.5B-Instruct",
    description: "本地查询扩展生成模型（GGUF Q8_0）",
    size: "~530MB",
    file: "Qwen2.5-0.5B-Instruct-Q8_0.gguf",
    modelscope: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    modelscopePath: "Qwen2.5-0.5B-Instruct-Q8_0.gguf",
    huggingface: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    huggingfacePath: "Qwen2.5-0.5B-Instruct-Q8_0.gguf",
  },
  "bge-reranker-v2-m3": {
    name: "bge-reranker-v2-m3",
    kind: "reranker",
    label: "BAAI/bge-reranker-v2-m3",
    description: "本地相关性重排模型（GGUF Q8_0）",
    size: "~607MB",
    recommended: true,
    file: "bge-reranker-v2-m3-Q8_0.gguf",
    modelscope: "gpustack/bge-reranker-v2-m3-GGUF",
    modelscopePath: "bge-reranker-v2-m3-Q8_0.gguf",
    huggingface: "gpustack/bge-reranker-v2-m3-GGUF",
    huggingfacePath: "bge-reranker-v2-m3-Q8_0.gguf",
  },
};

export function getEmbeddingModelEntry(modelName: string): GgufModelEntry | undefined {
  return EMBEDDING_MODELS[modelName];
}

export function getSearchModelEntry(modelName: string): GgufModelEntry | undefined {
  return SEARCH_MODELS[modelName];
}

/**
 * 解析模型在本地的 GGUF 文件路径
 * 约定：<modelsDir>/<modelName>/<file>
 */
export function resolveModelFilePath(modelsDir: string, entry: GgufModelEntry): string {
  return path.join(modelsDir, entry.name, entry.file);
}
