import { useState, useEffect, useCallback } from "react";
import WebSocketClient from "@/utils/WebSocketClient";

// 类型定义（与桌面端保持一致）
export interface Prompt {
  id: number;
  name: string;
  tags: string[];
  content: string;
  createTime: number;
  updateTime: number;
}

interface PromptsState {
  /** Prompt 列表 */
  prompts: Prompt[];
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

interface UsePromptsReturn extends PromptsState {
  /** 刷新 Prompt 列表 */
  refresh: () => Promise<void>;
  /** 根据 ID 获取 Prompt */
  getPromptById: (id: number) => Prompt | undefined;
}

/**
 * 通过 RPC 获取 Prompt 列表的 hook
 */
export function usePrompts(wsClient: WebSocketClient | null): UsePromptsReturn {
  const [state, setState] = useState<PromptsState>({
    prompts: [],
    loading: false,
    error: null,
  });

  // 获取 Prompt 列表
  const fetchPrompts = useCallback(async () => {
    if (!wsClient?.isConnected) {
      setState((prev) => ({ ...prev, error: "WebSocket 未连接" }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await wsClient.sendRequest("settings.getPrompts", {});
      const { prompts } = result as { prompts: Prompt[] };

      setState({
        prompts,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[usePrompts] 获取 Prompt 列表失败:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [wsClient]);

  // 根据 ID 获取 Prompt
  const getPromptById = useCallback(
    (id: number) => {
      return state.prompts.find((p) => p.id === id);
    },
    [state.prompts],
  );

  // WebSocket 连接后自动获取
  useEffect(() => {
    if (wsClient?.isConnected) {
      fetchPrompts();
    }
  }, [wsClient?.isConnected, fetchPrompts]);

  return {
    ...state,
    refresh: fetchPrompts,
    getPromptById,
  };
}

export default usePrompts;
