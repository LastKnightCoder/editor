import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Node } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { Bookmark, Link, Type } from "lucide-react";
import { cn } from "@tau/ui";
import { OverlayBackDismiss, type ExtensionLayerProps } from "@tau/editor/api";

import { applyPasteChoice, pasteMenuOf, type PasteChoice } from "../paste";

const CHOICES: { value: PasteChoice; title: string; icon: typeof Link; hint?: string }[] = [
  { value: "link", title: "链接", icon: Link, hint: "↵" },
  { value: "bookmark", title: "网页书签", icon: Bookmark },
  { value: "text", title: "纯文本", icon: Type },
];
const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Escape"]);

/** 空段落粘贴网址后的「粘贴为」菜单：默认保持链接，输入或点别处即收起。 */
export default function PasteMenuLayer({ readOnly }: ExtensionLayerProps) {
  const editor = useSlateStatic();
  const controller = pasteMenuOf(editor);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = !!state && !readOnly;

  useEffect(() => controller.close, [controller]);
  useEffect(() => {
    if (readOnly) controller.close();
  }, [readOnly, controller]);

  useLayoutEffect(() => {
    setActive(0);
    const path = state?.paragraph.current;
    if (!path || !Node.has(editor, path)) return setPosition(null);
    try {
      const rect = ReactEditor.toDOMNode(editor, Node.get(editor, path)).getBoundingClientRect();
      setPosition({ left: rect.left, top: rect.bottom + 6 });
    } catch {
      setPosition(null);
    }
  }, [state, editor]);

  useEffect(() => {
    if (!open) return;
    let root: HTMLElement;
    try {
      root = ReactEditor.toDOMNode(editor, editor);
    } catch {
      return;
    }
    // 捕获阶段先于编辑器处理方向键与回车；其他按键视为继续输入，收起菜单
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (!NAV_KEYS.has(event.key)) {
        if (!["Shift", "Meta", "Control", "Alt"].includes(event.key)) controller.close();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") controller.close();
      else if (event.key === "Enter") applyPasteChoice(editor, CHOICES[activeRef.current].value);
      else
        setActive(
          index => (index + (event.key === "ArrowDown" ? 1 : CHOICES.length - 1)) % CHOICES.length
        );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-bookmark-paste-menu]")) controller.close();
    };
    root.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", controller.close, { capture: true, passive: true });
    return () => {
      root.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", controller.close, { capture: true });
    };
  }, [open, editor, controller]);

  if (!open || !position) return null;
  return createPortal(
    <>
      <OverlayBackDismiss open={open} onDismiss={controller.close} />
      <div
        data-bookmark-paste-menu=""
        role="menu"
        aria-label="粘贴为"
        className="fixed z-[10050] w-[200px] rounded-[10px] border border-[var(--ed-border)] bg-[var(--ed-bg-surface)] p-1 text-[13px] shadow-[var(--ed-shadow-float)]"
        style={position}
        onMouseDown={event => event.preventDefault()}
      >
        <div className="px-2 pt-1 pb-0.5 text-[11.5px] text-[var(--ed-text-tertiary)]">粘贴为</div>
        {CHOICES.map((choice, index) => (
          <button
            key={choice.value}
            type="button"
            role="menuitem"
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent px-2 py-1.5 text-left text-[var(--ed-text)]",
              index === active && "bg-[var(--ed-bg-hover)]"
            )}
            onMouseEnter={() => setActive(index)}
            onClick={() => applyPasteChoice(editor, choice.value)}
          >
            <choice.icon size={14} strokeWidth={1.75} className="text-[var(--ed-text-secondary)]" />
            {choice.title}
            {choice.hint && (
              <kbd className="ml-auto rounded-[4px] border border-[var(--ed-border)] px-1 text-[11px] font-[var(--ed-font-mono)] text-[var(--ed-text-tertiary)]">
                {choice.hint}
              </kbd>
            )}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}
