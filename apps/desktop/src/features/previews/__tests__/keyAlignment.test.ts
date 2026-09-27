/**
 * 块身份对齐：渲染期（块卡片，按所在文本段原文定位）与预览页（从会话原文派生）
 * 必须算出同一个 key——否则点卡片打开的预览找不到块。
 */

import { describe, expect, it } from "vitest";
import { Role } from "@/constants";
import type { AssistantBlock, ChatSessionMessage } from "@/types/llm";
import { buildBlock } from "@/components/ChatUI/useChatMarkdownComponents";
import { blockRegistry, resolveBlockType } from "@/utils/blockRegistry";
import { extractChatBlocks, visibleMessages, visibleSegments } from "../model/chatBlocks";
import { parseFences } from "../model/fences";
import { chatBlockId } from "../useChatBlocks";

const text = (content: string, state: "streaming" | "final" = "final"): AssistantBlock => ({
  id: content.slice(0, 8),
  turnId: "t",
  type: "text",
  state,
  content,
});
const assistant = (...blocks: AssistantBlock[]) =>
  ({ role: Role.Assistant, content: "", assistant_blocks: blocks }) as ChatSessionMessage;

const page = `<!DOCTYPE html>\n<html><head><title>演示</title></head><body></body></html>`;

describe("渲染期 key 与预览页 key 一致", () => {
  it("逐块比对（含工具调用段、同段多块、生成中）", () => {
    const chat = {
      messages: [
        { role: Role.System, content: "sys" } as ChatSessionMessage,
        { role: Role.User, content: "q" } as ChatSessionMessage,
        assistant(
          text(`前言\n\`\`\`html\n${page}\n\`\`\``),
          {
            id: "tc",
            turnId: "t",
            type: "tool_call",
            state: "final",
            toolCall: {},
          } as AssistantBlock,
          text("```mermaid\ngraph TD\nA-->B\n```\n\n```mind-map\n- 根\n  - 子\n```"),
          text("```whiteboard\ntitle 流程\nnode a", "streaming")
        ),
      ],
    };
    const derived = extractChatBlocks(chat, resolveBlockType);
    expect(derived.map(b => b.type)).toEqual(["html", "mermaid", "mind-map", "whiteboard"]);

    const rendered: string[] = [];
    visibleMessages(chat).forEach((message, messageIndex) => {
      if (message.role !== Role.Assistant) return;
      const segments = visibleSegments(message as never);
      segments.forEach((segment, segmentIndex) => {
        if (segment.type !== "text") return;
        for (const fence of parseFences(segment.content)) {
          const renderer = blockRegistry.resolve(fence.lang, fence.content);
          if (!renderer) continue;
          const { block } = buildBlock({
            renderer,
            language: fence.lang,
            code: fence.content,
            idPrefix: "t",
            liveChat: true,
            chatId: "chat-7",
            messageIndex,
            segmentIndex,
            segmentText: segment.content,
            streamingSegment: segmentIndex === segments.length - 1,
          });
          rendered.push(block.id);
        }
      });
    });
    expect(rendered).toEqual(derived.map(b => chatBlockId("chat-7", b.key)));
  });

  it("非会话仓库的对话面（liveChat=false）按快照：不带 blockKey", () => {
    const renderer = blockRegistry.get("mind-map")!;
    const { block, generating } = buildBlock({
      renderer,
      language: "mind-map",
      code: "- 根",
      idPrefix: "vl-block",
      liveChat: false,
      chatId: "chat-3",
      messageIndex: 0,
      segmentIndex: 0,
      segmentText: "```mind-map\n- 根",
      streamingSegment: true,
    });
    expect(block.metadata.blockKey).toBeUndefined();
    expect(block.metadata.sourceChatId).toBeUndefined();
    expect(block.id.startsWith("vl-block-")).toBe(true);
    expect(generating).toBe(true);
  });
});
