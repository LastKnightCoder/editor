import { invoke } from "@/electron";

export interface CodexAvailability {
  available: boolean;
  reason: string | null;
}

export const resolveCodexAvailability =
  async (): Promise<CodexAvailability> => {
    try {
      return await invoke<CodexAvailability>("codex-agent:getAvailability");
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : "Codex SDK 不可用",
      };
    }
  };
