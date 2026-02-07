import { useState, useEffect, useCallback } from "react";
import WebSocketClient from "@/utils/WebSocketClient";

// Embedding 模型配置信息
export interface EmbeddingModelInfo {
  baseUrl: string;
  key: string;
  model: string;
  distance: number;
  dimensions: number;
}

interface EmbeddingConfigState {
  /** Embedding 模型配置 */
  embeddingModelInfo: EmbeddingModelInfo | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

interface UseEmbeddingConfigReturn extends EmbeddingConfigState {
  /** 刷新配置 */
  refresh: () => Promise<void>;
  /** 是否可以启用 RAG */
  canEnableRag: boolean;
}

/**
 * 通过 RPC 获取 Embedding 配置的 hook
 */
export function useEmbeddingConfig(
  wsClient: WebSocketClient | null,
): UseEmbeddingConfigReturn {
  const [state, setState] = useState<EmbeddingConfigState>({
    embeddingModelInfo: null,
    loading: false,
    error: null,
  });

  // 获取配置
  const fetchConfig = useCallback(async () => {
    if (!wsClient?.isConnected) {
      setState((prev) => ({ ...prev, error: "WebSocket 未连接" }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await wsClient.sendRequest(
        "settings.getEmbeddingModelInfo",
        {},
      );
      const { embeddingModelInfo } = result as {
        embeddingModelInfo: EmbeddingModelInfo | null;
      };

      setState({
        embeddingModelInfo,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useEmbeddingConfig] 获取配置失败:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [wsClient]);

  // WebSocket 连接后自动获取配置
  useEffect(() => {
    if (wsClient?.isConnected) {
      fetchConfig();
    }
  }, [wsClient?.isConnected, fetchConfig]);

  // 是否可以启用 RAG
  const canEnableRag = state.embeddingModelInfo !== null;

  return {
    ...state,
    refresh: fetchConfig,
    canEnableRag,
  };
}

export default useEmbeddingConfig;
