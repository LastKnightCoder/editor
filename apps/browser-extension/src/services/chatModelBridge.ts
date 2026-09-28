/**
 * 桌面会话投影（ChatSessionMessage，assistant_blocks 形状）→ 扩展渲染模型（ChatMessageType）。
 * M4.5 起扩展只读投影、不再写消息（内容由桌面 pi 会话落盘），所以只有这一个方向。
 * 消息带回的 piEntryIds 保留下来，改历史操作（删除/重新生成/建分支）按它定位；
 * 用户消息的 piVersions（会话树上同一位置的版本）保留下来，‹ i/n › 切换用。
 */
import type {
  ChatMessageType,
  ChatSessionMessage,
  MessageContentItem,
  RequestMessage,
  ResponseMessage,
  ToolCallPayload,
} from "@tau/shared";
import { Role, getAssistantContentBlocks } from "@tau/shared";

type ChatMessageWithToolContext = ChatMessageType & {
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
  requestContent?: MessageContentItem[];
};

/** 统一存储消息 → 渲染消息（用于 chat.get 读取后的展示） */
export const toDisplayMessages = (messages: ChatSessionMessage[]): ChatMessageType[] =>
  messages.map((message): ChatMessageType => {
    const id = message.clientId || "";

    if (message.role === Role.User) {
      const { piVersions } = message as RequestMessage;
      const display: ChatMessageType = {
        id,
        ...(message.piEntryIds ? { piEntryIds: message.piEntryIds } : {}),
        ...(piVersions ? { piVersions } : {}),
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
      ...(assistant.piEntryIds ? { piEntryIds: assistant.piEntryIds } : {}),
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
