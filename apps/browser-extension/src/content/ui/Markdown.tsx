import { memo, useMemo, type ReactNode } from "react";
import { MARKDOWN_LINK_CLASS, MarkdownRenderer } from "@tau/chat-ui/conversation";
import { useController } from "./context";

const CITE_HREF = "#tau-cite-";

/** [n] 段落引用 → 可点击的链接（跳过已是 Markdown 链接的 [n](…) 与脚注） */
export const linkCites = (text: string) =>
  text.replace(/\[(\d{1,3})\](?![(:])/g, (_, n: string) => `[${n}](${CITE_HREF}${n})`);

/**
 * AI 回答：与桌面同一个 Markdown 渲染（排版、代码块、公式、内容引用），
 * 另把 [n] 段落引用画成编号徽标，点击滚回原文。
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const controller = useController();
  const components = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith(CITE_HREF)) {
          const index = Number(href.slice(CITE_HREF.length));
          return (
            <button
              type="button"
              title="定位到原文"
              onClick={() => controller.scrollToBlock(index)}
              className="bg-accent-soft text-accent-text hover:bg-accent hover:text-ink-inverse mx-px inline-grid h-[17px] min-w-[17px] place-items-center rounded-[5px] px-1 align-[1px] text-[10.5px] leading-none font-semibold"
            >
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" className={MARKDOWN_LINK_CLASS}>
            {children}
          </a>
        );
      },
    }),
    [controller]
  );
  return (
    <MarkdownRenderer
      content={linkCites(text)}
      components={components}
      enableDocumentReference
      onReferenceClick={() => void controller.chat.openInTau()}
    />
  );
});
