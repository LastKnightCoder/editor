import { memo, type MouseEvent, type ReactNode } from "react";
import { Transforms, type Node } from "slate";
import { ReactEditor, useReadOnly, useSlateStatic, type RenderElementProps } from "slate-react";
import { MessageSquareQuote } from "lucide-react";
import { AnchoredPanel, cn } from "@tau/ui";
import type { ChatRefElement } from "../types";
import { ChatRefPreview } from "./ChatRefPreview";
import { ChatRefTitle } from "./labels";
import { useChatRefHover } from "./useChatRefHover";

/** 与 content-link 同一套点线下划线；前缀对话图标标明出处是对话 */
const LINK =
  "cursor-pointer text-accent-text underline decoration-dotted decoration-[1.5px] underline-offset-[3px] " +
  "decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)] " +
  "transition-[color,text-decoration-color] duration-300 hover:decoration-accent";
const LINK_ACTIVE = "decoration-accent";
const LINK_BROKEN = "cursor-default text-ink-3 line-through decoration-solid decoration-ink-3";

interface ChatRefProps {
  attributes: RenderElementProps["attributes"];
  element: ChatRefElement;
  children: ReactNode;
}

export const ChatRef = memo(({ attributes, element, children }: ChatRefProps) => {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const hover = useChatRefHover(element);

  const handleClick = (event: MouseEvent) => {
    // 编辑态单击只放光标，⌘/Ctrl 点击才打开；只读态单击打开
    if (!readOnly && !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    hover.openDock();
  };

  const remove = () => {
    hover.close();
    Transforms.removeNodes(editor, {
      at: ReactEditor.findPath(editor, element as unknown as Node),
    });
  };

  return (
    <>
      <span
        {...attributes}
        contentEditable={false}
        onClick={handleClick}
        {...hover.triggerProps}
        className={cn(
          LINK,
          hover.panel.open && LINK_ACTIVE,
          (hover.missing || hover.unshared) && LINK_BROKEN,
          hover.unshared && "no-underline"
        )}
      >
        <MessageSquareQuote
          aria-hidden
          className="mr-0.5 inline size-[0.9em] align-[-0.1em]"
          strokeWidth={1.75}
        />
        <ChatRefTitle title={hover.title} />
        {children}
      </span>
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
              wholeSession={!element.entryId}
              unshared={hover.unshared}
              onOpenDock={hover.openDock}
              onOpenPage={hover.openPage}
              onCopyLink={hover.copyLink}
              onRemove={readOnly ? undefined : remove}
            />
          )}
        </AnchoredPanel>
      )}
    </>
  );
});
