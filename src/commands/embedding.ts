import { invoke } from "@tauri-apps/api";

export const splitMarkdown = async (text: string): Promise<string[]> => {
  return await invoke('plugin:embedding|markdown_spilt', {
    text
  }) as string[];
}

export const embeddingOpenAI = async (apiKey: string, baseUrl: string, model: string, input: string): Promise<number[]> => {
  return await invoke('plugin:embedding|embedding_openai', {
    apiKey,
    baseUrl,
    model,
    input
  }) as number[];
}
