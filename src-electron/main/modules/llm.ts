import { ipcMain } from "electron";
import OpenAI from "openai";
import { chunk } from "llm-chunk";
import { RequestMessage, IndexType, SearchResult } from "@/types";
import { Role } from "@/constants";
import { Module } from "../types/module";
import FtsTable from "./tables/fts";
import VecDocumentTable from "./tables/vec-document";
import Database from "better-sqlite3";
import { getMarkdown } from "@/utils/markdown-helper";

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
      "chat-openai-with-rag",
      (
        _event,
        apiKey: string,
        baseUrl: string,
        model: string,
        messages: RequestMessage[],
        knowledgeOptions: {
          enable: boolean;
          modelInfo?: {
            key: string;
            model: string;
            baseUrl: string;
            distance: number;
          };
          limit: number;
        },
        databaseName: string,
      ) => {
        return this.chatWithRAG(
          apiKey,
          baseUrl,
          model,
          messages,
          knowledgeOptions,
          databaseName,
        );
      },
    );

    // 保持原有的 chat 方法作为向后兼容
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

  // 新的支持 RAG 的聊天方法
  async chatWithRAG(
    apiKey: string,
    baseUrl: string,
    model: string,
    messages: RequestMessage[],
    knowledgeOptions: {
      enable: boolean;
      modelInfo?: {
        key: string;
        model: string;
        baseUrl: string;
        distance: number;
      };
      limit: number;
    },
    databaseName: string,
  ): Promise<string | null> {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    let finalMessages = [...messages];

    // 如果启用了知识库功能，进行 RAG 处理
    if (knowledgeOptions.enable && messages.length > 0) {
      // 获取最后一条用户消息作为查询
      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user");

      if (lastUserMessage) {
        // 提取用户查询文本
        let userQuery = "";
        if (typeof lastUserMessage.content === "string") {
          userQuery = lastUserMessage.content;
        } else if (Array.isArray(lastUserMessage.content)) {
          userQuery = lastUserMessage.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join(" ");
        }

        if (userQuery.trim()) {
          try {
            // 获取数据库实例
            const { default: DatabaseModule } = await import("./database");
            const db = DatabaseModule.getDatabase(databaseName);

            if (db) {
              // 执行搜索
              const searchResults = await this.performRAGSearch(
                db,
                userQuery,
                knowledgeOptions,
              );

              if (searchResults.length > 0) {
                // 构建知识库上下文
                const knowledgeContext =
                  this.buildKnowledgeContext(searchResults);

                // 创建增强后的系统消息
                const enhancedSystemMessage: RequestMessage = {
                  role: Role.System,
                  content: [
                    ...lastUserMessage.content
                      .filter((item) => item.type !== "text")
                      .filter(Boolean),
                    {
                      type: "text",
                      text: `请基于以下知识库内容来回答用户的问题。如果知识库中没有相关信息，请如实说明并尽力回答。

<knowledge>
${knowledgeContext}
</knowledge>

<user_query>
${userQuery}
</user_query>
`,
                    },
                  ],
                };

                // 将增强后的系统消息插入到消息列表的开头（如果没有系统消息的话）
                const hasSystemMessage = finalMessages.some(
                  (msg) => msg.role === "system",
                );
                if (!hasSystemMessage) {
                  finalMessages = [enhancedSystemMessage, ...finalMessages];
                } else {
                  // 如果已有系统消息，替换第一条系统消息
                  const systemIndex = finalMessages.findIndex(
                    (msg) => msg.role === "system",
                  );
                  finalMessages[systemIndex] = enhancedSystemMessage;
                }
              }
            }
          } catch (error) {
            console.error("RAG 搜索失败:", error);
            // 如果搜索失败，继续正常的聊天流程
          }
        }
      }
    }

    // 转换消息格式并调用 LLM
    const openAIMessages: any[] = finalMessages.map((message) => {
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

  // 执行 RAG 搜索
  private async performRAGSearch(
    db: Database.Database,
    query: string,
    knowledgeOptions: {
      enable: boolean;
      modelInfo?: {
        key: string;
        model: string;
        baseUrl: string;
        distance: number;
      };
      limit: number;
    },
  ) {
    const searchParams = {
      query,
      types: [
        "card",
        "article",
        "project-item",
        "document-item",
      ] as IndexType[],
      limit: knowledgeOptions.limit || 5,
      modelInfo: knowledgeOptions.modelInfo,
    };

    // 并行执行 FTS 和向量搜索
    const [ftsResults, vecResults] = await Promise.all([
      // FTS 搜索
      FtsTable.searchContent(db, searchParams),
      // 向量搜索（如果有模型信息）
      knowledgeOptions.modelInfo
        ? VecDocumentTable.searchContent(db, searchParams)
        : Promise.resolve([]),
    ]);

    // 合并和去重结果
    const allResults = [...ftsResults, ...vecResults];
    const uniqueResults = allResults.filter(
      (result, index, self) =>
        index ===
        self.findIndex((r) => r.id === result.id && r.type === result.type),
    );

    // 按相关性排序（向量搜索结果优先，然后是 FTS 结果）
    return uniqueResults
      .sort((a, b) => {
        if (a.source === "vec-document" && b.source === "fts") return -1;
        if (a.source === "fts" && b.source === "vec-document") return 1;
        return 0;
      })
      .slice(0, knowledgeOptions.limit || 5);
  }

  private buildKnowledgeContext(searchResults: SearchResult[]): string {
    return searchResults
      .map((result) => {
        const content = getMarkdown(result.content);

        return `
<entry>
  <content_id>${result.contentId}</content_id>
  <title>${result.title || "无标题"}</title>
  <type>${this.getTypeDisplayName(result.type)}</type>
  <source>${result.source}</source>
  <content>${content}</content>
</entry>`;
      })
      .join("\n\n");
  }

  // 获取类型显示名称
  private getTypeDisplayName(type: string): string {
    const typeMap: Record<string, string> = {
      card: "卡片",
      article: "文章",
      "project-item": "项目条目",
      "document-item": "文档条目",
    };
    return typeMap[type] || type;
  }

  // 保持原有的 chat 方法作为向后兼容
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
