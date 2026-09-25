/**
 * 会话块的实时派生（D-057）：订阅对话仓库里的会话，流式写入时随之重算。
 * 预览页、块卡片（版本号）共用；解析口径见 model/chatBlocks。
 */

import useChatMessageStore from "@/stores/useChatMessageStore";
import type { ChatMessage } from "@/types";
import { resolveBlockType } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { extractChatBlocks, type ChatBlock } from "./model/chatBlocks";

// 按会话快照（不可变对象）缓存：同一时刻多张块卡片 + 预览页共用一次解析
const cache = new WeakMap<ChatMessage, ChatBlock[]>();
const EMPTY: ChatBlock[] = [];

export function chatBlocksOf(chat: ChatMessage | undefined): ChatBlock[] {
  if (!chat) return EMPTY;
  let blocks = cache.get(chat);
  if (!blocks) cache.set(chat, (blocks = extractChatBlocks(chat, resolveBlockType)));
  return blocks;
}

export function useChatBlocks(chatId: number | null | undefined): ChatBlock[] {
  return useChatMessageStore(s =>
    chatBlocksOf(chatId == null ? undefined : s.chats.find(c => c.id === chatId))
  );
}

export const chatBlockId = (chatId: number, key: string) => `chat:${chatId}:${key}`;

export function toBlockData(chatId: number, block: ChatBlock): BlockData {
  return {
    id: chatBlockId(chatId, block.key),
    type: block.type,
    content: block.content,
    metadata: {
      type: block.type,
      language: block.lang,
      title: block.title,
      isGenerating: block.generating,
      sourceChatId: chatId,
      blockKey: block.key,
      version: block.version,
      versionCount: block.versionCount,
    },
  };
}
