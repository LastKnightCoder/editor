/**
 * 渲染模型（ChatMessageType，旧）与统一存储模型（ChatSessionMessage）的双向桥。
 * 存储方向：assistant 旧 contentBlocks 以 content_blocks legacy 字段提交，
 * 经 migrateChatSessionMessages（shared）升级为 assistant_blocks，与桌面读取口径一致。
 */
import type {
  ChatMessageType,
  ChatSessionMessage,
  ContentBlock,
  MessageContentItem,
  RequestMessage,
  ResponseMessage,
  ToolCallPayload,
} from "@tau/shared";
import { Role, getAssistantContentBlocks, migrateChatSessionMessages } from "@tau/shared";

type ChatMessageWithToolContext = ChatMessageType & {
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
  requestContent?: MessageContentItem[];
};

/** 渲染消息 → 统一存储消息（用于 chat.create / chat.update / chat.branch 载荷）。
 * assistant 旧 contentBlocks 以 legacy 的 content_blocks 字段提交，
 * 经 migrateChatSessionMessages 升级为 assistant_blocks，与桌面读取口径一致。 */
export const toStoredMessages = (messages: ChatMessageType[]): ChatSessionMessage[] => {
  const legacy = messages.map((message): unknown => {
    const source = message as ChatMessageWithToolContext;

    if (source.role === "user") {
      return {
        clientId: source.id,
        role: Role.User,
        content:
          source.requestContent && source.requestContent.length > 0
            ? source.requestContent
            : source.content || "",
      };
    }

    if (source.role === "system") {
      return {
        clientId: source.id,
        role: Role.System,
        content: source.content || "",
      };
    }

    if (source.role === "tool") {
      return {
        clientId: source.id,
        role: Role.Tool,
        content: source.content || "",
        ...(source.name ? { name: source.name } : {}),
        ...(source.tool_call_id ? { tool_call_id: source.tool_call_id } : {}),
      };
    }

    return {
      clientId: source.id,
      role: Role.Assistant,
      content: source.content || "",
      ...(typeof source.reasoning === "string" ? { reasoning_content: source.reasoning } : {}),
      ...(source.tool_calls?.length ? { tool_calls: source.tool_calls } : {}),
      content_blocks: (source.contentBlocks ?? []) as ContentBlock[],
    };
  });

  return migrateChatSessionMessages(legacy as ChatSessionMessage[]).messages;
};

/** 统一存储消息 → 渲染消息（用于 chat.get 读取后的展示） */
export const toDisplayMessages = (messages: ChatSessionMessage[]): ChatMessageType[] =>
  messages.map((message): ChatMessageType => {
    const id = message.clientId || "";

    if (message.role === Role.User) {
      const display: ChatMessageType = {
        id,
        role: "user",
        content:
          typeof message.content === "string" ? message.content : previewContent(message.content),
        timestamp: 0,
      };
      if (Array.isArray(message.content)) {
        (display as ChatMessageWithToolContext).requestContent = message.content;
      }
      return display;
    }

    if (message.role === Role.System) {
      return {
        id,
        role: "system",
        content: typeof message.content === "string" ? message.content : "",
        timestamp: 0,
      };
    }

    if (message.role === Role.Tool) {
      const tool = message as RequestMessage;
      const display: ChatMessageType = {
        id,
        role: "tool",
        content: typeof tool.content === "string" ? tool.content : "",
        timestamp: 0,
      };
      if (tool.name) (display as ChatMessageWithToolContext).name = tool.name;
      if (tool.tool_call_id)
        (display as ChatMessageWithToolContext).tool_call_id = tool.tool_call_id;
      return display;
    }

    const assistant = message as ResponseMessage;
    return {
      id,
      role: "assistant",
      content: assistant.content || "",
      reasoning: assistant.reasoning_content || undefined,
      contentBlocks: getAssistantContentBlocks(assistant),
      ...(assistant.tool_calls?.length ? { tool_calls: assistant.tool_calls } : {}),
      timestamp: 0,
    };
  });

const previewContent = (content: MessageContentItem[]): string =>
  content
    .map(item => {
      if (item.type === "text") return item.text;
      if (item.type === "image") return "[图片]";
      if (item.type === "file") return item.fileName ? `[文件: ${item.fileName}]` : "[文件]";
      return "";
    })
    .filter(Boolean)
    .join("\n");

/** 提取会话首条 system 消息（systemPromptSnapshot 的存储形态） */
export const extractSystemPrompt = (messages: ChatSessionMessage[]): string | undefined => {
  const first = messages[0];
  if (first?.role === Role.System && typeof first.content === "string" && first.content) {
    return first.content;
  }
  return undefined;
};

/** 替换 / 追加会话首条 system 消息 */
export const withSystemPrompt = (
  messages: ChatSessionMessage[],
  systemPrompt?: string
): ChatSessionMessage[] => {
  const rest = extractSystemPrompt(messages) !== undefined ? messages.slice(1) : messages;
  if (!systemPrompt) {
    return rest;
  }
  return [{ role: Role.System, content: systemPrompt } as RequestMessage, ...rest];
};
