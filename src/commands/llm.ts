import { invoke } from "@tauri-apps/api";
import { Message } from "@/types";

export const chat = async (apiKey: string, baseUrl: string, model: string, messages: Message[]) => {
  return await invoke('plugin:llm|chat', {
    apiKey,
    baseUrl,
    model,
    messages
  }) as string;
}
