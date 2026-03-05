import { useState, useEffect, useCallback } from "react";
import WebSocketClient from "@/utils/WebSocketClient";

export interface Skill {
  folderName: string;
  name: string;
  description?: string;
  path: string;
  isInternal?: boolean;
  readmeContent?: string;
}

interface SkillsState {
  skills: Skill[];
  loading: boolean;
  error: string | null;
}

interface UseSkillsReturn extends SkillsState {
  refresh: () => Promise<void>;
}

export async function fetchSkillsViaRpc(wsClient: WebSocketClient) {
  const result = await wsClient.sendRequest("settings.getSkills", {});
  const { skills } = result as { skills: Skill[] };
  return skills;
}

export function useSkills(wsClient: WebSocketClient | null): UseSkillsReturn {
  const [state, setState] = useState<SkillsState>({
    skills: [],
    loading: false,
    error: null,
  });

  const fetchSkills = useCallback(async () => {
    if (!wsClient?.isConnected) {
      setState((prev) => ({ ...prev, error: "WebSocket 未连接" }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const skills = await fetchSkillsViaRpc(wsClient);
      setState({
        skills,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("[useSkills] 获取 Skills 失败:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [wsClient]);

  useEffect(() => {
    if (wsClient?.isConnected) {
      void fetchSkills();
    }
  }, [wsClient?.isConnected, fetchSkills]);

  return {
    ...state,
    refresh: fetchSkills,
  };
}

export default useSkills;
