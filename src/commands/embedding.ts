import { invoke } from "@/electron";

export const splitMarkdown = async (text: string): Promise<string[]> => {
  return await invoke('markdown-split', text) as string[];
}

export const embeddingOpenAI = async (apiKey: string, baseUrl: string, model: string, input: string): Promise<number[]> => {
  return await invoke('embedding-openai', apiKey, baseUrl, model, input) as number[];
}
