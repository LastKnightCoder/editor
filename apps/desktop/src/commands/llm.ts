import { invoke } from "@/electron";
import { RequestMessage, ToolCallPayload, ToolFunctionSchema } from "@/types";

export interface ChatCompletionResult {
  message: {
    role: string;
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: ToolCallPayload[];
  };
  finish_reason: string | null;
}

export const chat = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: RequestMessage[],
  options?: {
    tools?: ToolFunctionSchema[];
  }
): Promise<ChatCompletionResult> => {
  return await invoke("chat-openai", apiKey, baseUrl, model, messages, options);
};
