import { ipcMain } from "electron";
import OpenAI from "openai";
import { chunk } from "llm-chunk";
import { Message } from "@/types";
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
        messages: Message[],
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
    messages: Message[],
  ): Promise<string | null> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const res = await client.chat.completions.create({
      model,
      messages,
      temperature: 0,
      n: 1,
      top_p: 0,
      stream: false,
    });

    return res.choices[0].message.content;
  }
}

export default new LLMModule();
