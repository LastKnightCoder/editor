import { useState, useEffect, useCallback } from "react";
import WebSocketClient from "@/utils/WebSocketClient";

// 类型定义（与桌面端保持一致）
export interface ModelFeatures {
  online: boolean;
  thinking: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
  multimodal?: boolean;
}

export interface ModelConfig {
  name: string;
  description: string;
  features: ModelFeatures;
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  models: ModelConfig[];
}

interface LlmConfigsState {
  /** 所有 LLM 配置 */
  llmConfigs: ProviderConfig[];
  /** 当前聊天使用的 provider 配置 */
  currentProviderConfig: ProviderConfig | null;
  /** 当前聊天使用的 model 配置 */
  currentModelConfig: ModelConfig | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

interface UseLlmConfigsReturn extends LlmConfigsState {
  /** 刷新配置 */
  refresh: () => Promise<void>;
  /** 设置使用的模型 */
  setLlmUsage: (
    providerId: string,
    modelName: string,
    feature?: string,
  ) => Promise<void>;
  /** 当前模型名称（用于显示） */
  currentModelName: string;
  /** 是否支持图片 */
  isSupportImage: boolean;
  /** 是否支持文件 */
  isSupportFile: boolean;
}

/**
 * 通过 RPC 获取 LLM 配置的 hook
 */
export function useLlmConfigs(
  wsClient: WebSocketClient | null,
): UseLlmConfigsReturn {
  const [state, setState] = useState<LlmConfigsState>({
    llmConfigs: [],
    currentProviderConfig: null,
    currentModelConfig: null,
    loading: false,
    error: null,
  });

  // 获取配置
  const fetchConfigs = useCallback(async () => {
    if (!wsClient?.isConnected) {
      setState((prev) => ({ ...prev, error: "WebSocket 未连接" }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // 并行获取 LLM 配置列表和当前聊天模型配置
      const [configsResult, chatModelResult] = await Promise.all([
        wsClient.sendRequest("settings.getLlmConfigs", {}),
        wsClient.sendRequest("settings.getChatModelConfig", {}),
      ]);

      const { llmConfigs } = configsResult as { llmConfigs: ProviderConfig[] };
      const { providerConfig, modelConfig } = chatModelResult as {
        providerConfig: ProviderConfig | null;
        modelConfig: ModelConfig | null;
      };

      setState({
        llmConfigs,
        currentProviderConfig: providerConfig,
        currentModelConfig: modelConfig,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useLlmConfigs] 获取配置失败:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [wsClient]);

  // 设置使用的模型
  const setLlmUsage = useCallback(
    async (providerId: string, modelName: string, feature = "chat") => {
      if (!wsClient?.isConnected) {
        throw new Error("WebSocket 未连接");
      }

      await wsClient.sendRequest("settings.setLlmUsage", {
        feature,
        providerId,
        modelName,
      });

      // 刷新配置
      await fetchConfigs();
    },
    [wsClient, fetchConfigs],
  );

  // WebSocket 连接后自动获取配置
  useEffect(() => {
    if (wsClient?.isConnected) {
      fetchConfigs();
    }
  }, [wsClient?.isConnected, fetchConfigs]);

  // 计算当前模型名称
  const currentModelName = state.currentModelConfig?.name || "未选择模型";

  // 计算是否支持图片和文件
  const isSupportImage = state.currentModelConfig?.features.image ?? false;
  const isSupportFile = state.currentModelConfig?.features.file ?? false;

  return {
    ...state,
    refresh: fetchConfigs,
    setLlmUsage,
    currentModelName,
    isSupportImage,
    isSupportFile,
  };
}

export default useLlmConfigs;
