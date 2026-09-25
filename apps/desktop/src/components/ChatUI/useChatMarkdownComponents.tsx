/**
 * 对话 markdown 的代码与链接渲染（D-048）：停靠栏、对话页共用（原先两处各抄一份）。
 *  - mermaid → 图表；完整 HTML / 注册的可预览块 → BlockCard（或渲染器的内联展开形态）；
 *  - 其余围栏代码 → CodeBlock；行内代码 → surface 亮底 + line-1 描边 chip（D-009）；
 *  - 链接 → 系统浏览器打开。
 * 可预览块打开方式由调用方决定（新壳层走 block-preview 页面 / 纸内预览）。
 */

import { useMemo, type MouseEvent, type ReactNode } from "react";
import { MermaidRenderer } from "@tau/shared";
import { toast } from "@tau/ui";
import { openExternal } from "@/commands";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { shouldRenderAsBlockCode } from "@/layouts/ContentLayout/components/ChatSidebar/codeBlockUtils";
import { CodeBlock } from "./CodeBlock";

const toastApi = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
};

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

/** 代码块后面已有其它内容 = 该代码块已生成完毕（流式中判断是否仍在生成） */
function isCodeBlockCompleted(code: string, textContent: string | undefined): boolean {
  if (!textContent) return true;
  const index = textContent.indexOf(code);
  if (index === -1) return true;
  return /```[\s\S]*?\S/.test(textContent.slice(index + code.length));
}

export function useChatMarkdownComponents({
  isDark,
  onOpenBlock,
  idPrefix = "chat-block",
}: {
  isDark: boolean;
  onOpenBlock?: (block: BlockData) => void;
  /** 块 id 前缀：同一会话在不同容器里打开时互不串预览 */
  idPrefix?: string;
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
      const match = /language-([\w-]+)/.exec(className || "");
      const language = match?.[1];
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
      const chatId = messageMeta?.chatId ?? 0;
      const messageIndex = messageMeta?.messageIndex ?? 0;
      const blockIndex = messageMeta?.blockIndex;
      const generating =
        Boolean(messageMeta?.isStreaming) &&
        Boolean(messageMeta?.isLastTextBlock) &&
        !isCodeBlockCompleted(code, messageMeta?.textContent);

      if (language === "mermaid") {
        return <MermaidRenderer code={code} isDark={isDark} messageApi={toastApi} />;
      }

      const isCompleteHtml = language === "html" && /^<!DOCTYPE\s+html>/i.test(code.trim());
      if (
        language &&
        (language !== "html" || isCompleteHtml) &&
        blockRegistry.isPreviewable(language)
      ) {
        const idSuffix =
          blockIndex != null ? `idx-${blockIndex}` : `hash-${simpleHash(code.slice(0, 200))}`;
        const block: BlockData = {
          id: `${idPrefix}-${language}-${chatId}-${messageIndex}-${idSuffix}`,
          type: language,
          content: code,
          metadata: {
            type: language,
            language,
            timestamp: Date.now(),
            sourceChatId: chatId,
            sourceMessageIndex: messageIndex,
            blockIndex,
            isGenerating: generating,
          },
        };
        const renderer = blockRegistry.getRenderer(language);
        if (renderer?.extractMetadata)
          Object.assign(block.metadata, renderer.extractMetadata(code));
        if (renderer?.renderInline && renderer.inlineMode === "expanded") {
          return (
            <div className="my-3">
              {renderer.renderInline({ block, onPreview: () => onOpenBlock?.(block) })}
            </div>
          );
        }
        return <BlockCard block={block} onPreview={onOpenBlock} />;
      }

      return <CodeBlock code={code} language={language ?? "text"} />;
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
  }, [idPrefix, isDark, onOpenBlock]);
}
