import { invoke } from "@/electron";
import { Message } from "@/types";

export const chat = async (apiKey: string, baseUrl: string, model: string, messages: Message[]) => {
  return await invoke('chat-openai', apiKey, baseUrl, model, messages);
}
