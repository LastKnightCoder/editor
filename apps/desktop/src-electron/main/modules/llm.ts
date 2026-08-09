import { ipcMain } from "electron";
import OpenAI from "openai";
import type {
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { RequestMessage, ReasoningEffort, ToolFunctionSchema } from "@/types";
import { Module } from "../types/module";
import { getModelRequestOverrides } from "@/utils/model-overrides";
import { buildResponsesPayload } from "@/utils/openai-responses-adapter";
import { smartChunk } from "../utils/smart-chunk";
import { normalizeThinkTaggedText } from "@/utils/thinkTagNormalizer";

interface KimiThinkingParams {
  thinking?: { type: "enabled" | "disabled" };
}

type ChatCompletionParams = Omit<
  ChatCompletionCreateParamsNonStreaming,
  "reasoning_effort"
> &
  KimiThinkingParams & {
    reasoning_effort?: Exclude<ReasoningEffort, "none">;
  };

class LLMModule implements Module {
  name: string;

  constructor() {
    this.name = "llm";
  }

  async init() {
    ipcMain.handle(
      "embedding-openai",
      (
        _event,
        apiKey: string,
        baseUrl: string,
        model: string,
        input: string,
        dimensions?: number,
      ) => {
        return this.embedding(apiKey, baseUrl, model, input, dimensions);
      },
    );

    ipcMain.handle("markdown-split", (_event, text: string) => {
      return this.splitMarkdown(text);
    });

    ipcMain.handle(
      "chat-openai",
      (
        _event,
        apiKey: string,
        baseUrl: string,
        model: string,
        messages: RequestMessage[],
        options?: {
          reasoningEffort?: ReasoningEffort;
          tools?: ToolFunctionSchema[];
        },
      ) => {
        return this.chat(apiKey, baseUrl, model, messages, options);
      },
    );

    ipcMain.handle(
      "chat-openai-responses",
      (
        _event,
        apiKey: string,
        baseUrl: string,
        model: string,
        messages: RequestMessage[],
        options?: {
          reasoningEffort?: ReasoningEffort;
          tools?: ToolFunctionSchema[];
        },
      ) => {
        return this.chatResponses(apiKey, baseUrl, model, messages, options);
      },
    );
  }

  async embedding(
    apiKey: string,
    baseUrl: string,
    model: string,
    input: string,
    dimensions?: number,
  ): Promise<number[]> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const res = await client.embeddings.create({
      model,
      input,
      dimensions,
    });

    return res.data[0].embedding;
  }

  async splitMarkdown(text: string): Promise<string[]> {
    return smartChunk(text, {
      minLength: 500,
      maxLength: 2000,
      overlap: 0,
      splitter: "paragraph",
    });
  }

  async chat(
    apiKey: string,
    baseUrl: string,
    model: string,
    messages: RequestMessage[],
    options?: {
      reasoningEffort?: ReasoningEffort;
      tools?: ToolFunctionSchema[];
    },
  ): Promise<{
    message: OpenAI.Chat.ChatCompletionMessage;
    finish_reason: string | null;
  }> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const { reasoningEffort, tools } = options || {};
    const normalizedReasoningEffort =
      reasoningEffort && reasoningEffort !== "none"
        ? reasoningEffort
        : undefined;

    // 获取模型特定的参数覆盖配置
    const modelOverrides = getModelRequestOverrides({
      modelName: model,
      reasoningEffort,
    });

    // 分离 reasoning_effort，因为 OpenAI SDK 的类型定义与我们的不完全一致
    const { reasoning_effort: overrideReasoningEffort, ...restOverrides } =
      modelOverrides;

    const params: ChatCompletionParams = {
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: 0.3,
      top_p: 1,
      stream: false,
      reasoning_effort:
        overrideReasoningEffort !== undefined
          ? undefined
          : normalizedReasoningEffort,
      frequency_penalty: 0,
      tools: tools as ChatCompletionTool[] | undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      // 应用模型特定的参数覆盖（不包含 reasoning_effort）
      ...restOverrides,
    };

    const res = await client.chat.completions.create(
      params as ChatCompletionCreateParamsNonStreaming,
    );

    const responseMessage = res.choices[0].message;
    const responseReasoningContent =
      typeof (responseMessage as { reasoning_content?: unknown })
        .reasoning_content === "string"
        ? ((responseMessage as { reasoning_content?: string })
            .reasoning_content ?? "")
        : undefined;
    const normalizedContent = normalizeThinkTaggedText(
      typeof responseMessage.content === "string"
        ? responseMessage.content
        : "",
    );

    return {
      message: {
        ...responseMessage,
        content: normalizedContent.content,
        ...(typeof responseReasoningContent === "string"
          ? { reasoning_content: responseReasoningContent }
          : {}),
      },
      finish_reason: res.choices[0].finish_reason ?? null,
    };
  }

  async chatResponses(
    apiKey: string,
    baseUrl: string,
    model: string,
    messages: RequestMessage[],
    options?: {
      reasoningEffort?: ReasoningEffort;
      tools?: ToolFunctionSchema[];
    },
  ): Promise<{
    message: OpenAI.Chat.ChatCompletionMessage;
    finish_reason: string | null;
  }> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const params = buildResponsesPayload({
      model,
      messages,
      stream: false,
      reasoningEffort: options?.reasoningEffort,
      tools: options?.tools,
    }) as ResponseCreateParamsNonStreaming;

    const res = await client.responses.create(params);
    const output = Array.isArray(res.output) ? res.output : [];
    const toolCalls = output
      .filter((item) => item.type === "function_call")
      .map<OpenAI.Chat.ChatCompletionMessageToolCall>((item) => ({
        id: item.call_id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments ?? "{}",
        },
      }));
    const reasoningContent = output
      .filter((item) => item.type === "reasoning")
      .flatMap((item) => item.summary ?? [])
      .map((summary) => summary.text)
      .filter(Boolean)
      .join("\n");
    const normalizedContent = normalizeThinkTaggedText(res.output_text ?? "");
    const finishReason = toolCalls.length > 0 ? "tool_calls" : res.status;

    return {
      message: {
        role: "assistant",
        content: normalizedContent.content,
        refusal: null,
        ...(reasoningContent || normalizedContent.reasoning_content
          ? {
              reasoning_content:
                reasoningContent || normalizedContent.reasoning_content,
            }
          : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason:
        finishReason === "completed" ? "stop" : (finishReason ?? null),
    };
  }
}

export default new LLMModule();
