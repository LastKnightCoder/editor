import { RequestMessage, KnowledgeOptions } from "@/types";
import { getMarkdown } from "./markdown-helper";
import { searchContent } from "./search";

/**
 * 从用户消息中提取查询文本
 */
export function extractUserQuery(lastUserMessage: RequestMessage): string {
  if (typeof lastUserMessage.content === "string") {
    return lastUserMessage.content;
  } else if (Array.isArray(lastUserMessage.content)) {
    return lastUserMessage.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join(" ");
  }
  return "";
}

/**
 * 获取类型显示名称
 */
export function getTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    card: "卡片",
    article: "文章",
    "project-item": "项目条目",
    "document-item": "文档条目",
  };
  return typeMap[type] || type;
}

/**
 * 构建知识库上下文（XML 格式）
 */
export function buildKnowledgeContext(searchResults: any[]): string {
  return searchResults
    .map((result) => {
      const content = getMarkdown(result.content);

      return `
<entry>
  <id>${result.id}</id>
  <title>${result.title || "无标题"}</title>
  <type>${getTypeDisplayName(result.type)}</type>
  <source>${result.source}</source>
  <content>${content}</content>
</entry>`;
    })
    .join("\n\n");
}

/**
 * 创建增强后的系统消息
 */
export function createEnhancedSystemMessage(
  knowledgeContext: string,
  userQuery: string,
  lastUserMessage: RequestMessage,
): RequestMessage {
  return {
    role: "system" as any,
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

## 引用规范
当你引用知识库中的内容时，请使用以下格式来标记引用：
:ref[显示文本]{id=内容ID type=类型}

例如：
- :ref[这个卡片]{id=123 type=card} 提到了相关概念
- 根据 :ref[项目文档]{id=456 type=project-item} 的说明
- 如 :ref[知识库条目]{id=789 type=document-item} 所述

支持的类型：

- card
- article
- project-item
- document-item

type 必须是这四种值之一，不可自己造出新的类型。

请在回答中适当使用这种引用格式，让用户能够快速定位到相关内容。`,
      },
    ],
  };
}

/**
 * 执行 RAG 搜索并返回增强后的消息列表
 */
export async function performRAGEnhancement(
  messages: RequestMessage[],
  knowledgeOptions: KnowledgeOptions,
): Promise<RequestMessage[]> {
  // 获取最后一条用户消息作为查询
  const lastUserMessage = [...messages]
    .reverse()
    .find((msg) => msg.role === "user");

  if (!lastUserMessage) {
    return messages;
  }

  // 提取用户查询文本
  const userQuery = extractUserQuery(lastUserMessage);
  if (!userQuery.trim()) {
    return messages;
  }

  // 执行搜索
  const searchParams = {
    query: userQuery,
    types: ["card", "article", "project-item", "document-item"] as (
      | "card"
      | "article"
      | "project-item"
      | "document-item"
    )[],
    limit: knowledgeOptions.limit || 5,
    modelInfo: knowledgeOptions.modelInfo,
  };

  const searchResults = await searchContent(searchParams);

  if (searchResults.length === 0) {
    return messages;
  }

  // 构建知识库上下文
  const knowledgeContext = buildKnowledgeContext(searchResults);

  // 创建增强后的系统消息
  const enhancedSystemMessage = createEnhancedSystemMessage(
    knowledgeContext,
    userQuery,
    lastUserMessage,
  );

  // 将增强后的系统消息插入到消息列表中
  const finalMessages = [...messages];
  const hasSystemMessage = finalMessages.some((msg) => msg.role === "system");

  if (!hasSystemMessage) {
    finalMessages.unshift(enhancedSystemMessage);
  } else {
    // 如果已有系统消息，替换第一条系统消息
    const systemIndex = finalMessages.findIndex((msg) => msg.role === "system");
    finalMessages[systemIndex] = enhancedSystemMessage;
  }

  return finalMessages;
}
