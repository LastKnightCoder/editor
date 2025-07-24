import { ipcMain } from "electron";
import OpenAI from "openai";
import { chunk } from "llm-chunk";
import { RequestMessage } from "@/types";
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
      ) => {
        return this.embedding(apiKey, baseUrl, model, input);
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
      ) => {
        return this.chat(apiKey, baseUrl, model, messages);
      },
    );
  }

  async embedding(
    apiKey: string,
    baseUrl: string,
    model: string,
    input: string,
  ): Promise<number[]> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const res = await client.embeddings.create({
      model,
      input,
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
  ): Promise<string | null> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    // 直接转换为 OpenAI 格式，无需复杂判断
    const openAIMessages: any[] = messages.map((message) => {
      const role = message.role;

      if (typeof message.content === "string") {
        return {
          role,
          content: message.content,
        };
      }

      // 只有一个文本内容时使用简单格式
      if (message.content.length === 1 && message.content[0].type === "text") {
        return {
          role,
          content: message.content[0].text,
        };
      }

      // 多模态内容格式
      const content = message.content.map((item) => {
        if (item.type === "text") {
          return {
            type: "text" as const,
            text: item.text,
          };
        } else if (item.type === "image") {
          return {
            type: "image_url" as const,
            image_url: {
              url: item.image,
            },
          };
        }
        // 文件类型暂时转为文本处理
        return {
          type: "text" as const,
          text: `[文件: ${item.file}]`,
        };
      });

      return {
        role,
        content,
      };
    });

    const res = await client.chat.completions.create({
      model,
      messages: openAIMessages,
      temperature: 0.3,
      n: 1,
      top_p: 0,
      stream: false,
    });

    return res.choices[0].message.content;
  }
}

export default new LLMModule();
