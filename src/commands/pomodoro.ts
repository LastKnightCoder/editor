import { invoke } from "@/electron";
import { PomodoroPreset, PomodoroSession } from "@/types";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";

export const listPomodoroPresets = async (): Promise<PomodoroPreset[]> => {
  return invoke("pomodoro:list-presets");
};

export const createPomodoroPreset = async (payload: {
  name: string;
  mode: "countdown" | "countup";
  durationMin?: number;
}): Promise<PomodoroPreset> => {
  return invoke("pomodoro:create-preset", payload);
};

export const updatePomodoroPreset = async (payload: {
  id: number;
  name?: string;
  mode?: "countdown" | "countup";
  durationMin?: number;
}): Promise<PomodoroPreset> => {
  return invoke("pomodoro:update-preset", payload);
};

export const archivePomodoroPreset = async (
  id: number,
  archived: boolean,
): Promise<number> => {
  return invoke("pomodoro:archive-preset", { id, archived });
};

export const reorderPomodoroPresets = async (
  orderedIds: number[],
): Promise<number> => {
  return invoke("pomodoro:reorder-presets", { orderedIds });
};

export const deletePomodoroPreset = async (id: number): Promise<number> => {
  return invoke("pomodoro:delete-preset", id);
};

export const selectPomodoroPreset = async (
  preset: PomodoroPreset,
): Promise<void> => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) throw new Error("Client not initialized");
  return (await client.sendRequest(
    "pomodoro:set-selected-preset",
    preset,
  )) as unknown as void;
};

export const getActivePomodoroSession =
  async (): Promise<PomodoroSession | null> => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) throw new Error("Client not initialized");
    return (await client.sendRequest(
      "pomodoro:get-active-session",
      null,
    )) as PomodoroSession | null;
  };

export const startPomodoroSession = async (
  presetId: number,
  expectedMs?: number,
): Promise<PomodoroSession> => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) throw new Error("Client not initialized");
  return (await client.sendRequest("pomodoro:start-session", {
    presetId,
    expectedMs,
  })) as PomodoroSession;
};

export const pausePomodoroSession =
  async (): Promise<PomodoroSession | null> => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) throw new Error("Client not initialized");
    return (await client.sendRequest(
      "pomodoro:pause-session",
      null,
    )) as PomodoroSession | null;
  };

export const resumePomodoroSession =
  async (): Promise<PomodoroSession | null> => {
    const client = useBackendWebsocketStore.getState().client;
    if (!client) throw new Error("Client not initialized");
    return (await client.sendRequest(
      "pomodoro:resume-session",
      null,
    )) as PomodoroSession | null;
  };

export const stopPomodoroSession = async (
  asComplete = true,
): Promise<PomodoroSession | null> => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client) throw new Error("Client not initialized");
  return (await client.sendRequest("pomodoro:stop-session", {
    asComplete,
  })) as PomodoroSession | null;
};

export const listPomodoroSessions = async (params: {
  presetId?: number;
  start?: number;
  end?: number;
  limit?: number;
  status?: PomodoroSession["status"];
}): Promise<PomodoroSession[]> => {
  return invoke("pomodoro:list-sessions", params);
};

export const summaryPomodoroToday = async (): Promise<{
  count: number;
  focusMs: number;
}> => {
  return invoke("pomodoro:summary-today");
};

export const summaryPomodoroTotal = async (): Promise<{
  count: number;
  focusMs: number;
}> => {
  return invoke("pomodoro:summary-total");
};

export const deletePomodoroSession = async (
  sessionId: number,
): Promise<number> => {
  return invoke("pomodoro:delete-session", sessionId);
};

export const deletePomodoroSessions = async (
  sessionIds: number[],
): Promise<number> => {
  return invoke("pomodoro:delete-sessions", sessionIds);
};

export const updatePomodoroSession = async (
  sessionId: number,
  focusMs: number,
): Promise<PomodoroSession> => {
  return invoke("pomodoro:update-session", { sessionId, focusMs });
};
