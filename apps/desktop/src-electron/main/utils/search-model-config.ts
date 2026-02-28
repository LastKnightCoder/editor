import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import log from "electron-log";
import PathUtil from "./PathUtil";

interface SearchModelProviderSetting {
  source?: "modelscope" | "huggingface";
  localModelDir?: string;
  queryExpanderModel?: string;
  rerankerModel?: string;
  enableExpander?: boolean;
  enableReranker?: boolean;
  devicePolicy?: "auto" | "cpu" | "cuda";
  batchSize?: number;
}

interface SettingWithSearchModelProvider {
  searchModelProvider?: SearchModelProviderSetting;
}

export interface ResolvedSearchModelConfig {
  source: "modelscope" | "huggingface";
  localModelDir: string;
  queryExpanderModel: string;
  rerankerModel: string;
  enableExpander: boolean;
  enableReranker: boolean;
  devicePolicy: "auto" | "cpu" | "cuda";
  batchSize: number;
}

const DEFAULT_SEARCH_MODEL_CONFIG: ResolvedSearchModelConfig = {
  source: "modelscope",
  localModelDir: "",
  queryExpanderModel: "qwen3-0.6b",
  rerankerModel: "bge-reranker-v2-m3",
  enableExpander: true,
  enableReranker: true,
  devicePolicy: "auto",
  batchSize: 8,
};

export async function readSearchModelProviderConfig(): Promise<ResolvedSearchModelConfig> {
  const defaultModelDir = join(app.getPath("userData"), "search-models");

  try {
    const settingPath = join(PathUtil.getAppDir(), "setting.json");
    const settingContent = await fs.readFile(settingPath, "utf-8");
    const setting: SettingWithSearchModelProvider = JSON.parse(settingContent);
    const raw = setting.searchModelProvider || {};

    const source =
      raw.source === "huggingface" || raw.source === "modelscope"
        ? raw.source
        : DEFAULT_SEARCH_MODEL_CONFIG.source;
    const localModelDir =
      typeof raw.localModelDir === "string" && raw.localModelDir.trim()
        ? raw.localModelDir.trim()
        : defaultModelDir;
    const queryExpanderModel =
      typeof raw.queryExpanderModel === "string" &&
      raw.queryExpanderModel.trim()
        ? raw.queryExpanderModel.trim()
        : DEFAULT_SEARCH_MODEL_CONFIG.queryExpanderModel;
    const rerankerModel =
      typeof raw.rerankerModel === "string" && raw.rerankerModel.trim()
        ? raw.rerankerModel.trim()
        : DEFAULT_SEARCH_MODEL_CONFIG.rerankerModel;
    const enableExpander =
      typeof raw.enableExpander === "boolean"
        ? raw.enableExpander
        : DEFAULT_SEARCH_MODEL_CONFIG.enableExpander;
    const enableReranker =
      typeof raw.enableReranker === "boolean"
        ? raw.enableReranker
        : DEFAULT_SEARCH_MODEL_CONFIG.enableReranker;
    const devicePolicy =
      raw.devicePolicy === "cuda" ||
      raw.devicePolicy === "cpu" ||
      raw.devicePolicy === "auto"
        ? raw.devicePolicy
        : DEFAULT_SEARCH_MODEL_CONFIG.devicePolicy;
    const batchSize =
      typeof raw.batchSize === "number" && Number.isFinite(raw.batchSize)
        ? Math.max(1, Math.floor(raw.batchSize))
        : DEFAULT_SEARCH_MODEL_CONFIG.batchSize;

    return {
      source,
      localModelDir,
      queryExpanderModel,
      rerankerModel,
      enableExpander,
      enableReranker,
      devicePolicy,
      batchSize,
    };
  } catch (error) {
    log.warn(
      "[SearchModelConfig] Failed to load setting.json, use defaults:",
      error,
    );
    return {
      ...DEFAULT_SEARCH_MODEL_CONFIG,
      localModelDir: defaultModelDir,
    };
  }
}
