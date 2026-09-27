import { ipcMain } from "electron";
import OpenAI from "openai";
import type {
  ChatCompletionTool,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { RequestMessage, ToolFunctionSchema } from "@/types";
import { Module } from "../types/module";
import { getModelRequestOverrides } from "@/utils/model-overrides";
import { smartChunk } from "../utils/smart-chunk";
import { normalizeThinkTaggedText } from "@/utils/thinkTagNormalizer";

type ChatCompletionParams = ChatCompletionCreateParamsNonStreaming;

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
        dimensions?: number
      ) => {
        return this.embedding(apiKey, baseUrl, model, input, dimensions);
      }
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
          tools?: ToolFunctionSchema[];
        }
      ) => {
        return this.chat(apiKey, baseUrl, model, messages, options);
      }
    );
  }

  async embedding(
    apiKey: string,
    baseUrl: string,
    model: string,
    input: string,
    dimensions?: number
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
      tools?: ToolFunctionSchema[];
    }
  ): Promise<{
    message: OpenAI.Chat.ChatCompletionMessage;
    finish_reason: string | null;
  }> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const { tools } = options || {};
    // 模型特定的参数覆盖（某些渠道不接受 temperature/top_p 同时出现等）
    const modelOverrides = getModelRequestOverrides({ modelName: model });

    const params: ChatCompletionParams = {
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: 0.3,
      top_p: 1,
      stream: false,
      frequency_penalty: 0,
      tools: tools as ChatCompletionTool[] | undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      ...modelOverrides,
    };

    const res = await client.chat.completions.create(params);

    const responseMessage = res.choices[0].message;
    const responseReasoningContent =
      typeof (responseMessage as { reasoning_content?: unknown }).reasoning_content === "string"
        ? ((responseMessage as { reasoning_content?: string }).reasoning_content ?? "")
        : undefined;
    const normalizedContent = normalizeThinkTaggedText(
      typeof responseMessage.content === "string" ? responseMessage.content : ""
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
}

export default new LLMModule();
