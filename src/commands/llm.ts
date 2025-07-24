import { invoke } from "@/electron";
import { RequestMessage } from "@/types";

export const chat = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: RequestMessage[],
) => {
  return await invoke("chat-openai", apiKey, baseUrl, model, messages);
};
