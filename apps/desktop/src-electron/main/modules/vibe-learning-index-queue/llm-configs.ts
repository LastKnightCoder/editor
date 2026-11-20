import { promises as fs } from "fs";
import { join } from "node:path";
import log from "electron-log";
import PathUtil from "../../utils/PathUtil";
import transcriptionModule from "../transcription";
import { normalizeModelSize } from "../../utils/transcription-model";
import { resolveUsageSlot } from "../llm-usage-slot";
import { resolveEmbeddingConfig } from "../../utils/embedding-config";
import vibeLearningDBManager from "../vibe-learning-db";
import type { VibeLearningIndexQueue } from "./index";
import type {
  EmbeddingConfig,
  TranscriptionConfig,
  ImageDescriptionConfig,
  SettingForTranscription,
} from "./types";
import type { SettingForLlmSlots } from "../llm-usage-slot";

/**
 * 从 setting.json 读取 embedding 配置
 */
export async function getEmbeddingConfig(
  manager: VibeLearningIndexQueue
): Promise<EmbeddingConfig | null> {
  // 使用缓存避免频繁读取文件
  if (manager.cachedEmbeddingConfig !== undefined) {
    return manager.cachedEmbeddingConfig;
  }

  try {
    const settingPath = join(PathUtil.getAppDir(), "setting.json");
    const settingContent = await fs.readFile(settingPath, "utf-8");
    const resolved = resolveEmbeddingConfig(JSON.parse(settingContent));
    if (!resolved) {
      manager.cachedEmbeddingConfig = null;
      return null;
    }
    manager.cachedEmbeddingConfig = resolved;

    // 更新 VibeLearningDBManager 的维度配置
    vibeLearningDBManager.setVecDimensions(resolved.dimensions);

    log.info(
      `[VibeLearningIndexQueue] Loaded embedding config: model=${resolved.model}, dimensions=${resolved.dimensions}`
    );

    return manager.cachedEmbeddingConfig;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error loading embedding config: ${error}`);
    manager.cachedEmbeddingConfig = null;
    return null;
  }
}

/**
 * 清除 embedding 配置缓存（配置变更时调用）
 */
export function clearEmbeddingConfigCache(manager: VibeLearningIndexQueue): void {
  manager.cachedEmbeddingConfig = undefined;
  log.info("[VibeLearningIndexQueue] Cleared embedding config cache");
}

/**
 * 从 setting.json 读取转译配置
 */
export async function getTranscriptionConfig(
  manager: VibeLearningIndexQueue
): Promise<TranscriptionConfig | null> {
  // 使用缓存避免频繁读取文件
  if (manager.cachedTranscriptionConfig !== undefined) {
    return manager.cachedTranscriptionConfig;
  }

  try {
    const settingPath = join(PathUtil.getAppDir(), "setting.json");
    const settingContent = await fs.readFile(settingPath, "utf-8");
    const setting: SettingForTranscription = JSON.parse(settingContent);

    // 提取模型尺寸（"faster-whisper-base" / "whisper-cpp-base" -> "base"）
    const model = normalizeModelSize(setting.transcription?.currentModel);

    // 获取模型目录
    const modelDir = transcriptionModule.getModelsDir();

    // 断句优化模型：分配了「转录断句优化」槽且模型仍在设置里才启用
    const llm = resolveUsageSlot(setting, "transcriptionOptimization");

    manager.cachedTranscriptionConfig = { model, modelDir, llm };

    log.info(
      `[VibeLearningIndexQueue] Loaded transcription config: model=${model}, modelDir=${modelDir}, llm=${llm ? `${llm.providerId}/${llm.modelId}` : "none"}`
    );

    return manager.cachedTranscriptionConfig;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error loading transcription config: ${error}`);
    manager.cachedTranscriptionConfig = null;
    return null;
  }
}

/**
 * 清除转译配置缓存（配置变更时调用）
 */
export function clearTranscriptionConfigCache(manager: VibeLearningIndexQueue): void {
  manager.cachedTranscriptionConfig = undefined;
  log.info("[VibeLearningIndexQueue] Cleared transcription config cache");
}

/**
 * 从 setting.json 读取图片描述 LLM 配置
 */
export async function getImageDescriptionConfig(
  manager: VibeLearningIndexQueue
): Promise<ImageDescriptionConfig | null> {
  // 使用缓存避免频繁读取文件
  if (manager.cachedImageDescriptionConfig !== undefined) {
    return manager.cachedImageDescriptionConfig;
  }

  try {
    const settingPath = join(PathUtil.getAppDir(), "setting.json");
    const settingContent = await fs.readFile(settingPath, "utf-8");
    const setting: SettingForLlmSlots = JSON.parse(settingContent);

    manager.cachedImageDescriptionConfig = resolveUsageSlot(
      setting,
      "vibeLearningImageDescription"
    );

    log.info(
      `[VibeLearningIndexQueue] Loaded image description config: ${
        manager.cachedImageDescriptionConfig
          ? `${manager.cachedImageDescriptionConfig.providerId}/${manager.cachedImageDescriptionConfig.modelId}`
          : "none"
      }`
    );

    return manager.cachedImageDescriptionConfig;
  } catch (error) {
    log.error(`[VibeLearningIndexQueue] Error loading image description config: ${error}`);
    manager.cachedImageDescriptionConfig = null;
    return null;
  }
}

/**
 * 清除图片描述配置缓存（配置变更时调用）
 */
export function clearImageDescriptionConfigCache(manager: VibeLearningIndexQueue): void {
  manager.cachedImageDescriptionConfig = undefined;
  log.info("[VibeLearningIndexQueue] Cleared image description config cache");
}
