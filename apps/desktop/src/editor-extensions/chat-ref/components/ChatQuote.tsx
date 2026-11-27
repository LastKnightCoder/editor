/**
 * 对话摘录块：引文为主，来源一行在下。原文是正文的一部分，对话删除后照样显示。
 * 外框（选中描边、末尾添加段落、拖拽）由内核 frame 负责，这里只画卡片。
 */

import { Transforms, type Node } from "slate";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { MessageSquareQuote } from "lucide-react";
import { AnchoredPanel, cn } from "@tau/ui";
import type { ElementRenderProps } from "@tau/editor";
import type { ChatQuoteElement } from "../types";
import { toChatRefElement } from "../operations";
import { ChatRefPreview } from "./ChatRefPreview";
import { ChatRefTitle, QuoteSource, QuoteDeletedNotice, QuoteAction } from "./labels";
import { useChatRefHover } from "./useChatRefHover";

export default function ChatQuote({ element }: ElementRenderProps<ChatQuoteElement>) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const hover = useChatRefHover(element);

  const toInline = () => {
    const at = ReactEditor.findPath(editor, element as unknown as Node);
    Transforms.removeNodes(editor, { at });
    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "" },
          toChatRefElement(element),
          { type: "formatted", text: "" },
        ],
      } as unknown as Node,
      { at }
    );
  };

  return (
    <div
      className={cn(
        "border-line-1 rounded-tau-md group/quote relative my-1 border py-2.5 pl-4 pr-3",
        "before:bg-accent/45 before:absolute before:bottom-2.5 before:left-0 before:top-2.5 before:w-[3px] before:rounded-r-[3px]"
      )}
    >
      <div className="text-ink-1 leading-[1.85] [overflow-wrap:anywhere] whitespace-pre-wrap">
        {element.quoteText}
      </div>
      <div className="text-tau-micro text-ink-3 mt-1.5 flex items-center gap-1.5">
        <MessageSquareQuote className="size-[13px] shrink-0" strokeWidth={1.75} />
        <span
          className={cn(
            "text-ink-2 min-w-0 truncate",
            !hover.unshared && !hover.missing && "hover:text-accent-text cursor-pointer"
          )}
          onClick={hover.openDock}
          {...hover.triggerProps}
        >
          <ChatRefTitle title={hover.title} />
        </span>
        <QuoteSource turn={element.turn} model={element.model} />
        {hover.missing && <QuoteDeletedNotice />}
        <span className="flex-1" />
        <span className="flex gap-0.5 opacity-0 transition-opacity group-hover/quote:opacity-100">
          {!hover.unshared && !hover.missing && (
            <QuoteAction kind="dock" onClick={hover.openDock} />
          )}
          {!readOnly && <QuoteAction kind="inline" onClick={toInline} />}
        </span>
      </div>
      {hover.panel.anchor && (
        <AnchoredPanel
          anchor={hover.panel.anchor}
          open={hover.panel.open}
          placement="bottom-start"
          className="w-[380px] max-w-[380px]"
          {...hover.panelProps}
          onTransitionEnd={event => {
            if (!hover.panel.open && event.target === event.currentTarget)
              hover.panel.setMounted(false);
          }}
        >
          {hover.panel.mounted && (
            <ChatRefPreview
              title={hover.title}
              target={hover.query.data}
              error={hover.query.error}
              wholeSession={false}
              unshared={hover.unshared}
              quote={element.quoteText}
              onOpenDock={hover.openDock}
              onOpenPage={hover.openPage}
              onCopyLink={hover.copyLink}
            />
          )}
        </AnchoredPanel>
      )}
    </div>
  );
}
