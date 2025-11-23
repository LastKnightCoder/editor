import { invoke } from "@/electron";
import { RequestMessage, ReasoningEffort } from "@/types";

export const chat = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: RequestMessage[],
  options?: {
    reasoningEffort?: ReasoningEffort;
  },
) => {
  return await invoke("chat-openai", apiKey, baseUrl, model, messages, options);
};
