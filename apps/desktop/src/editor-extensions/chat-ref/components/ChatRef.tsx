import { memo, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Range, Transforms, type Node } from "slate";
import {
  ReactEditor,
  useFocused,
  useReadOnly,
  useSelected,
  useSlateStatic,
  type RenderElementProps,
} from "slate-react";
import { MessageSquareQuote } from "lucide-react";
import { AnchoredPanel, cn } from "@tau/ui";
import type { ChatRefElement } from "../types";
import { ChatRefPreview } from "./ChatRefPreview";
import { ChatRefTitle } from "./labels";
import { RenameInput } from "./RenameInput";
import { useChatRefHover } from "./useChatRefHover";
import { useChatRefI18n } from "../i18n";

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
  const { t } = useChatRefI18n();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const hover = useChatRefHover(element);
  const [editing, setEditing] = useState(false);
  const canRename = !readOnly && !hover.unshared;
  const caretOn = canRename && selected && focused && !editing;

  const pathOf = () => ReactEditor.findPath(editor, element as unknown as Node);

  const rename = (value: string) => {
    const label = value.trim();
    const at = pathOf();
    if (label) Transforms.setNodes<ChatRefElement>(editor, { label }, { at });
    else Transforms.unsetNodes(editor, "label", { at });
  };

  const startEditing = () => {
    hover.close();
    setEditing(true);
  };
  const stopEditing = (value?: string) => {
    setEditing(false);
    if (value !== undefined) {
      const next = value.trim();
      // 改回对话原名等于不自定义，继续跟随对话标题
      rename(next === hover.title ? "" : next);
    }
    try {
      const at = pathOf();
      ReactEditor.focus(editor as ReactEditor);
      Transforms.select(editor, { path: [...at, 0], offset: 0 });
      Transforms.move(editor);
    } catch {
      // 节点已被移除
    }
  };

  // 光标停在引用上按 ↵ 改名（void 节点自身收不到键盘事件）
  useEffect(() => {
    if (!caretOn) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== "Enter") return;
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      // 选区跨过引用时 ↵ 照常替换选中内容
      if (!editor.selection || !Range.isCollapsed(editor.selection)) return;
      event.preventDefault();
      event.stopPropagation();
      startEditing();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

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

  if (editing)
    return (
      <span {...attributes} contentEditable={false} className="text-accent-text">
        <MessageSquareQuote
          aria-hidden
          className="mr-0.5 inline size-[0.9em] align-[-0.1em]"
          strokeWidth={1.75}
        />
        <RenameInput
          initial={hover.label || hover.title}
          ariaLabel={t("rename.label")}
          className="[field-sizing:content] h-[1.6em] align-baseline text-[0.95em]"
          onCommit={value => stopEditing(value)}
          onCancel={() => stopEditing()}
        />
        {children}
      </span>
    );

  return (
    <>
      <span
        {...attributes}
        contentEditable={false}
        onClick={handleClick}
        onDoubleClick={event => {
          if (!canRename) return;
          event.preventDefault();
          startEditing();
        }}
        {...hover.triggerProps}
        className={cn(
          LINK,
          "relative",
          hover.panel.open && LINK_ACTIVE,
          caretOn && "bg-selected rounded-[3px]",
          (hover.missing || hover.unshared) && LINK_BROKEN,
          hover.unshared && "no-underline"
        )}
      >
        <MessageSquareQuote
          aria-hidden
          className="mr-0.5 inline size-[0.9em] align-[-0.1em]"
          strokeWidth={1.75}
        />
        <ChatRefTitle title={hover.label || hover.title} />
        {caretOn && !hover.panel.open && (
          <span className="bg-surface border-line-1 rounded-tau-sm text-tau-micro text-ink-3 pointer-events-none absolute top-full left-0 z-10 mt-1 border px-1.5 py-0.5 whitespace-nowrap no-underline shadow-[var(--tau-shadow-float)]">
            {t("rename.inlineHint")}
          </span>
        )}
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
              label={hover.label}
              onRename={canRename ? rename : undefined}
              onEditingChange={hover.setPinned}
            />
          )}
        </AnchoredPanel>
      )}
    </>
  );
});
