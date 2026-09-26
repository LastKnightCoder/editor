import { useState, useEffect, useCallback } from "react";
import WebSocketClient from "@/utils/WebSocketClient";
import type { LLMModelSetting, LLMProviderSetting } from "./piLlmTypes";

// 类型与桌面端 v2（pi 对齐）一致，经 settings.* RPC 传输
interface LlmConfigsState {
  /** 所有 LLM 配置 */
  llmConfigs: LLMProviderSetting[];
  /** 当前聊天使用的 provider 配置 */
  currentProviderConfig: LLMProviderSetting | null;
  /** 当前聊天使用的 model 配置 */
  currentModelConfig: LLMModelSetting | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

interface UseLlmConfigsReturn extends LlmConfigsState {
  /** 刷新配置 */
  refresh: () => Promise<void>;
  /** 设置使用的模型 */
  setLlmUsage: (providerId: string, modelId: string, feature?: string) => Promise<void>;
  /** 当前模型名称（用于显示） */
  currentModelName: string;
  /** 是否支持图片（聊天上传以 pi 为准：仅文本与图片） */
  isSupportImage: boolean;
}

/**
 * 通过 RPC 获取 LLM 配置的 hook
 */
export function useLlmConfigs(wsClient: WebSocketClient | null): UseLlmConfigsReturn {
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
      setState(prev => ({ ...prev, error: "WebSocket 未连接" }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // 并行获取 LLM 配置列表和当前聊天模型配置
      const [configsResult, chatModelResult] = await Promise.all([
        wsClient.sendRequest("settings.getLlmConfigs", {}),
        wsClient.sendRequest("settings.getChatModelConfig", {}),
      ]);

      const { llmConfigs } = configsResult as { llmConfigs: LLMProviderSetting[] };
      const { provider, model } = chatModelResult as {
        provider: LLMProviderSetting | null;
        model: LLMModelSetting | null;
      };

      setState({
        llmConfigs,
        currentProviderConfig: provider,
        currentModelConfig: model,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useLlmConfigs] 获取配置失败:", error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [wsClient]);

  // 设置使用的模型
  const setLlmUsage = useCallback(
    async (providerId: string, modelId: string, feature = "chat") => {
      if (!wsClient?.isConnected) {
        throw new Error("WebSocket 未连接");
      }

      await wsClient.sendRequest("settings.setLlmUsage", {
        feature,
        providerId,
        modelId,
      });

      // 刷新配置
      await fetchConfigs();
    },
    [wsClient, fetchConfigs]
  );

  // WebSocket 连接后自动获取配置
  useEffect(() => {
    if (wsClient?.isConnected) {
      fetchConfigs();
    }
  }, [wsClient?.isConnected, fetchConfigs]);

  const currentModelName =
    state.currentModelConfig?.name || state.currentModelConfig?.id || "未选择模型";

  // 聊天上传以 pi 为准：输入模态 input 含 image 才可传图（文件不再作为消息类型，模型用 read 工具读）
  const isSupportImage = state.currentModelConfig?.input.includes("image") ?? false;

  return {
    ...state,
    refresh: fetchConfigs,
    setLlmUsage,
    currentModelName,
    isSupportImage,
  };
}

export default useLlmConfigs;
