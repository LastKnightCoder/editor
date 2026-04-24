import { Role } from "@/constants/llm";
import type { RequestMessage, ReasoningEffort } from "@/types";

export interface OpenAIToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ResponsesInputItem =
  | {
      type?: "message";
      role: "user" | "assistant";
      content: string;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

export interface ResponsesFunctionTool {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

const contentToText = (content: RequestMessage["content"]): string => {
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((item) => {
      if (item.type === "text") {
        return item.text;
      }
      if (item.type === "image") {
        return item.image;
      }
      if (item.type === "file") {
        return item.fileName ?? item.file;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

export const toResponsesInput = (
  messages: RequestMessage[],
): ResponsesInputItem[] =>
  messages.flatMap((message) => {
    if (message.role === Role.System) {
      return [];
    }

    if (message.role === Role.Tool) {
      return message.tool_call_id
        ? [
            {
              type: "function_call_output" as const,
              call_id: message.tool_call_id,
              output: contentToText(message.content),
            },
          ]
        : [];
    }

    const content = contentToText(message.content);
    const items: ResponsesInputItem[] = [];
    if (message.tool_calls?.length) {
      items.push(
        ...message.tool_calls.map((call) => ({
          type: "function_call" as const,
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments ?? "{}",
        })),
      );
    }
    if (content || items.length === 0) {
      items.unshift({
        type: "message",
        role: message.role,
        content,
      });
    }
    return items;
  });

export const toResponsesInstructions = (
  messages: RequestMessage[],
): string | undefined => {
  const instructions = messages
    .filter((message) => message.role === Role.System)
    .map((message) => contentToText(message.content).trim())
    .filter(Boolean)
    .join("\n\n");

  return instructions || undefined;
};

export const toResponsesTools = (
  tools?: OpenAIToolSchema[],
): ResponsesFunctionTool[] | undefined => {
  if (!tools?.length) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
};

export const buildResponsesPayload = (params: {
  model: string;
  messages: RequestMessage[];
  stream: boolean;
  reasoningEffort?: ReasoningEffort;
  tools?: OpenAIToolSchema[];
}) => {
  const reasoningEffort =
    params.reasoningEffort && params.reasoningEffort !== "none"
      ? params.reasoningEffort
      : undefined;
  const tools = toResponsesTools(params.tools);

  return {
    model: params.model,
    input: toResponsesInput(params.messages),
    ...(toResponsesInstructions(params.messages)
      ? { instructions: toResponsesInstructions(params.messages) }
      : {}),
    stream: params.stream,
    store: false,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(tools?.length
      ? { tools, tool_choice: "auto", parallel_tool_calls: true }
      : {}),
  };
};
