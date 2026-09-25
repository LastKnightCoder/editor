/**
 * 对话 markdown 的代码与链接渲染（D-048 / D-057）：停靠栏、对话页及各域内对话共用。
 *  - 注册的可预览块（blockRegistry 按围栏语言解析）→ 块卡片，或渲染器的对话内直出形态
 *    （Mermaid / 白板，右上角「放大」）；
 *  - 其余围栏代码 → CodeBlock；行内代码 → surface 亮底 + line-1 描边 chip（D-009）；
 *  - 链接 → 系统浏览器打开。
 *
 * 块身份：liveChat 的对话面（对话页 / 停靠栏，会话在 useChatMessageStore 里）用
 * 「会话 + 消息 . 段 . 围栏」稳定 key，预览页据此实时取内容；其它对话面按快照打开。
 * 打开方式由调用方决定（onOpenBlock）；未提供时推入块预览页（快照）。
 */

import { useMemo, type MouseEvent, type ReactNode } from "react";
import { toast } from "@tau/ui";
import { openExternal } from "@/commands";
import BlockCard from "@/components/BlockCard";
import { RecoverableBoundary } from "@/components/ErrorState";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData, BlockRenderer } from "@/types/block-preview";
import { usePageOptional } from "@/page/PageProvider";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { shouldRenderAsBlockCode } from "@/layouts/ContentLayout/components/ChatSidebar/codeBlockUtils";
import { parseFences } from "@/features/previews/model/fences";
import { blockKey } from "@/features/previews/model/chatBlocks";
import { chatBlockId } from "@/features/previews/useChatBlocks";
import { openBlockPreview } from "@/features/previews/openBlock";
import { CodeBlock } from "./CodeBlock";

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

interface BuildBlockArgs {
  renderer: BlockRenderer;
  language: string;
  code: string;
  idPrefix: string;
  liveChat: boolean;
  chatId: number;
  messageIndex: number;
  segmentIndex?: number;
  segmentText?: string;
  streamingSegment: boolean;
}

/** 渲染期组块：按所在文本段原文定位段内第几个围栏，得出与预览页一致的 key */
export function buildBlock(args: BuildBlockArgs): { block: BlockData; generating: boolean } {
  const { renderer, language, code, chatId, messageIndex, segmentIndex, segmentText } = args;
  const fences = segmentText ? parseFences(segmentText) : [];
  const fenceIndex = fences.findIndex(f => f.content === code);
  const fence = fences[fenceIndex];
  const generating = args.streamingSegment && Boolean(fence) && !fence.closed;
  const live = args.liveChat && chatId > 0 && segmentIndex != null && fenceIndex >= 0;
  const key = live ? blockKey(messageIndex, segmentIndex, fenceIndex) : undefined;
  const block: BlockData = {
    id: key
      ? chatBlockId(chatId, key)
      : `${args.idPrefix}-${language}-${chatId}-${messageIndex}-${segmentIndex ?? "x"}-${
          fenceIndex >= 0 ? fenceIndex : simpleHash(code.slice(0, 200))
        }`,
    type: renderer.type,
    content: code,
    metadata: {
      type: renderer.type,
      language,
      title: renderer.title?.(code)?.trim() || undefined,
      isGenerating: generating,
      sourceChatId: key ? chatId : undefined,
      blockKey: key,
    },
  };
  return { block, generating };
}

export function useChatMarkdownComponents({
  isDark: _isDark,
  onOpenBlock,
  idPrefix = "chat-block",
  liveChat = false,
}: {
  isDark: boolean;
  onOpenBlock?: (block: BlockData) => void;
  /** 快照块 id 前缀：同一会话在不同容器里打开时互不串 */
  idPrefix?: string;
  /** 会话在 useChatMessageStore 里（对话页 / 停靠栏）：块按稳定 key 实时预览 */
  liveChat?: boolean;
}) {
  return useMemo(() => {
    const Code = ({
      children,
      className,
      "data-markdown-block-code": markdownBlockCode,
      node: _node,
      ...rest
    }: {
      children?: ReactNode;
      className?: string;
      "data-markdown-block-code"?: string;
      node?: unknown;
    }) => {
      const { messageMeta } = useMarkdownContext();
      const page = usePageOptional();
      const match = /language-([\w-]+)/.exec(className || "");
      const language = match?.[1]?.toLowerCase();
      const isBlock =
        Boolean(match) ||
        shouldRenderAsBlockCode({ className, "data-markdown-block-code": markdownBlockCode });

      if (!isBlock) {
        return (
          <code
            {...rest}
            className="border-line-1 bg-page font-tau-mono text-ink-1 mx-px rounded-[5px] border px-[5px] py-px text-[0.88em]"
          >
            {children}
          </code>
        );
      }

      const code = String(children)
        .replace(/^\r?\n/, "")
        .replace(/\r?\n$/, "");
      const renderer = blockRegistry.resolve(language, code);
      if (!renderer || !language) return <CodeBlock code={code} language={language ?? "text"} />;

      const { block, generating } = buildBlock({
        renderer,
        language,
        code,
        idPrefix,
        liveChat,
        chatId: messageMeta?.chatId ?? 0,
        messageIndex: messageMeta?.messageIndex ?? 0,
        segmentIndex: messageMeta?.blockIndex,
        segmentText: messageMeta?.textContent,
        streamingSegment: Boolean(messageMeta?.isStreaming && messageMeta?.isLastTextBlock),
      });
      const open = onOpenBlock
        ? () => onOpenBlock(block)
        : page
          ? () => openBlockPreview(page.navigator, block)
          : undefined;

      const Inline = renderer.display === "inline" ? renderer.Inline : undefined;
      if (Inline) {
        return (
          <RecoverableBoundary
            resetKeys={[code]}
            fallback={() => <CodeBlock code={code} language={language} />}
          >
            <Inline block={block} generating={generating} onExpand={open} />
          </RecoverableBoundary>
        );
      }
      return <BlockCard block={block} renderer={renderer} generating={generating} onOpen={open} />;
    };

    const Link = ({
      children,
      href,
      node: _node,
      ...props
    }: {
      children?: ReactNode;
      href?: string;
      node?: unknown;
    }) => (
      <a
        {...props}
        href={href}
        className="text-accent-text decoration-accent/35 hover:decoration-accent underline underline-offset-[3px]"
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (!href) return;
          event.preventDefault();
          openExternal(href).catch(() => toast.error("打开链接失败"));
        }}
      >
        {children}
      </a>
    );

    return { code: Code, a: Link };
  }, [idPrefix, liveChat, onOpenBlock]);
}
