/**
 * 对话块模型（D-057，纯函数）：从会话原文派生出全部可预览块、稳定身份与版本分组。
 *
 * 身份 key = 「第几条可见消息 . 第几个内容段 . 段内第几个围栏」——与 MessageView 的分段
 * 口径一致（可见消息 = 非 system；内容段 = 过滤空文本 / 空思考后的 assistant_blocks），
 * 渲染期的块卡片与预览页各自算出同一个 key，预览页据此从对话仓库实时取内容
 * （生成中逐字更新、停靠栏里继续追问的新版本直接出现）。
 *
 * 版本：同一会话里同类型、同名（去掉 v3 / v2.0 这类版本后缀）的块视为同一产物的多个版本；
 * 取不到标题的块各自独立，不与别人合并。
 */

import { Role } from "@/constants";
import type { ChatMessage } from "@/types";
import type { AssistantBlock, ChatSessionMessage, ResponseMessage } from "@/types/llm";
import { parseFences } from "./fences";

export interface BlockTypeInfo {
  /** 注册的渲染器类型（别名已归一） */
  type: string;
  /** 从内容取标题；取不到返回 undefined */
  title: (content: string) => string | undefined;
}

/** 语言 → 渲染器信息；非可预览语言返回 null（由渲染器注册表提供，测试可注入） */
export type ResolveBlockType = (lang: string, content: string) => BlockTypeInfo | null;

export interface ChatBlock {
  key: string;
  type: string;
  lang: string;
  content: string;
  title?: string;
  /** 块所在消息仍在流式生成、且围栏尚未闭合 */
  generating: boolean;
  messageIndex: number;
  /** 版本分组 key；无标题的块为自身 key */
  groupKey: string;
  /** 1 起的版本号与同组总数 */
  version: number;
  versionCount: number;
}

export const blockKey = (messageIndex: number, segment: number, fence: number) =>
  `${messageIndex}.${segment}.${fence}`;

const VERSION_SUFFIX = /[\s\-_·(（]*v\s*\d+(?:\.\d+)*[)）]?\s*$/i;

export function normalizeTitle(title: string): string {
  return title.replace(VERSION_SUFFIX, "").trim().toLowerCase();
}

/** 与 MessageView 同口径的内容段：去掉空文本 / 空思考 */
export function visibleSegments(message: ResponseMessage): AssistantBlock[] {
  return (message.assistant_blocks ?? []).filter(block =>
    block.type === "text" || block.type === "reasoning" ? block.content.trim().length > 0 : true
  );
}

export function visibleMessages(chat: Pick<ChatMessage, "messages">): ChatSessionMessage[] {
  return chat.messages.filter(message => message.role !== Role.System);
}

export function extractChatBlocks(
  chat: Pick<ChatMessage, "messages">,
  resolve: ResolveBlockType
): ChatBlock[] {
  const messages = visibleMessages(chat);
  const blocks: Omit<ChatBlock, "version" | "versionCount">[] = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== Role.Assistant) return;
    const isLast = messageIndex === messages.length - 1;
    visibleSegments(message as ResponseMessage).forEach((segment, segmentIndex) => {
      if (segment.type !== "text") return;
      parseFences(segment.content).forEach((fence, fenceIndex) => {
        const info = resolve(fence.lang, fence.content);
        if (!info) return;
        const key = blockKey(messageIndex, segmentIndex, fenceIndex);
        const title = info.title(fence.content)?.trim() || undefined;
        blocks.push({
          key,
          type: info.type,
          lang: fence.lang,
          content: fence.content,
          title,
          generating: isLast && !fence.closed && segment.state === "streaming",
          messageIndex,
          groupKey: title ? `${info.type}::${normalizeTitle(title)}` : key,
        });
      });
    });
  });

  const counts = new Map<string, number>();
  blocks.forEach(b => counts.set(b.groupKey, (counts.get(b.groupKey) ?? 0) + 1));
  const seen = new Map<string, number>();
  return blocks.map(b => {
    const version = (seen.get(b.groupKey) ?? 0) + 1;
    seen.set(b.groupKey, version);
    return { ...b, version, versionCount: counts.get(b.groupKey)! };
  });
}

/** 同组的全部版本（按出现顺序） */
export function versionsOf(blocks: ChatBlock[], block: ChatBlock): ChatBlock[] {
  return blocks.filter(b => b.groupKey === block.groupKey);
}
