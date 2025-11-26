import { ipcMain } from "electron";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { chunk } from "llm-chunk";
import { RequestMessage, ReasoningEffort, ToolFunctionSchema } from "@/types";
import { Module } from "../types/module";

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
    return chunk(text, {
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

    const notSupportTemperature = ["o1", "o3", "o4", "gpt-5"].some((model) =>
      model.startsWith(model),
    );
    const notSupportFrequencyPenalty = ["gemini"].some((model) =>
      model.startsWith(model),
    );

    const res = await client.chat.completions.create({
      model,
      messages: messages as any,
      temperature: notSupportTemperature ? undefined : 0.3,
      stream: false,
      reasoning_effort: normalizedReasoningEffort,
      frequency_penalty: notSupportFrequencyPenalty ? undefined : 0,
      tools: tools as ChatCompletionTool[] | undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    });

    return {
      message: res.choices[0].message,
      finish_reason: res.choices[0].finish_reason ?? null,
    };
  }
}

export default new LLMModule();
