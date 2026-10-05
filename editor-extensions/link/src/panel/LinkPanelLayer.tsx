import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Node, Range, Transforms, type BaseSelection, type Path } from "slate";
import { ReactEditor, useSlateSelection, useSlateStatic } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { cn } from "@tau/ui";
import { OverlayBackDismiss, useNotifier, type ExtensionLayerProps } from "@tau/editor/api";

import type { LinkElement } from "../types";
import {
  isPlainLink,
  relinkRange,
  selectAfterLink,
  unlinkAt,
  updateLink,
  wrapLink,
} from "../operations";
import { isInvalidLinkUrl, normalizeLinkUrl } from "../url";
import { linkPanelOf, type LinkPanelState } from "./controller";
import {
  LinkCreate,
  LinkEdit,
  LinkNotice,
  LinkView,
  type LinkFormHandle,
} from "./LinkPanelContent";
import { useOpenLink } from "./openLink";

const GAP = 8;
const VIEWPORT_EDGE = 8;
/** 与卡片退场过渡同长，退场期间保留内容 */
const EXIT_DURATION = 160;
/** 新建期间选区用 CSS Highlight 保持高亮，文档不留空链接 */
const PENDING_HIGHLIGHT = "tau-link-pending";
const TYPING_KEYS = new Set(["Backspace", "Delete", "Enter"]);

type Anchor = { rect: DOMRect; prefer: "above" | "below" };
type CommitSource = "enter" | "outside";

const keyIds = new WeakMap<object, number>();
let nextKeyId = 0;
const keyOf = (value: object) => {
  let id = keyIds.get(value);
  if (id === undefined) keyIds.set(value, (id = ++nextKeyId));
  return id;
};

const contentKey = (state: LinkPanelState) => {
  switch (state.mode) {
    case "view":
    case "edit":
      return `${state.mode}:${keyOf(state.element)}`;
    case "create":
      return `create:${keyOf(state.range)}`;
    default:
      return state.mode;
  }
};

/** 跨行链接取离 y 最近的那一行；y 为空取首行 */
const pickLine = (rects: DOMRect[], y: number | null): DOMRect | undefined => {
  const lines = rects.filter(rect => rect.width > 0 || rect.height > 0);
  if (y === null || lines.length < 2) return lines[0];
  const distance = (rect: DOMRect) => Math.abs((rect.top + rect.bottom) / 2 - y);
  return lines.reduce((best, rect) => (distance(rect) < distance(best) ? rect : best));
};

/** 光标在链接内时取光标所在行的纵坐标 */
const caretY = (element: HTMLElement): number | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.height ? rect.top + rect.height / 2 : null;
};

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void };
type HighlightCtor = new (...ranges: globalThis.Range[]) => unknown;

export default function LinkPanelLayer({ readOnly }: ExtensionLayerProps) {
  const editor = useSlateStatic();
  const selection = useSlateSelection();
  const controller = linkPanelOf(editor);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );
  const notifier = useNotifier();
  const openLink = useOpenLink();

  const open = state.mode !== "closed";
  const [shown, setShown] = useState<LinkPanelState>(state);
  const [visible, setVisible] = useState(false);
  const display = open ? state : shown;

  const positionerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<LinkFormHandle | null>(null);
  const settledRef = useRef(false);

  // 退场期间保留上一个状态的内容；进场下一帧再显形，透明度与位移才有过渡
  useEffect(() => {
    if (open) {
      setShown(state);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => {
      settledRef.current = false;
      setShown(state);
    }, EXIT_DURATION);
    return () => window.clearTimeout(timer);
  }, [open, state]);

  useEffect(() => {
    if (readOnly) controller.close();
  }, [readOnly, controller]);

  useEffect(() => controller.close, [controller]);

  useEffect(() => {
    if (!readOnly) controller.caretChanged(selection, ReactEditor.isFocused(editor));
  }, [selection, readOnly, controller, editor]);

  // 打字收起光标唤出的浮层；按住 ⌘/Ctrl 时链接显示手型
  useEffect(() => {
    if (readOnly) return;
    let root: HTMLElement;
    try {
      root = ReactEditor.toDOMNode(editor, editor);
    } catch {
      return;
    }
    const onType = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 || TYPING_KEYS.has(e.key)) controller.typed();
    };
    const syncMod = (e: KeyboardEvent) =>
      root.toggleAttribute("data-link-mod", e.metaKey || e.ctrlKey);
    const clearMod = () => root.removeAttribute("data-link-mod");
    root.addEventListener("keydown", onType);
    window.addEventListener("keydown", syncMod);
    window.addEventListener("keyup", syncMod);
    window.addEventListener("blur", clearMod);
    return () => {
      root.removeEventListener("keydown", onType);
      window.removeEventListener("keydown", syncMod);
      window.removeEventListener("keyup", syncMod);
      window.removeEventListener("blur", clearMod);
      clearMod();
    };
  }, [editor, readOnly, controller]);

  const pathOf = (element: LinkElement): Path | null => {
    try {
      return ReactEditor.findPath(editor, element);
    } catch {
      return null;
    }
  };

  const linkDom = (element: LinkElement): HTMLElement | null => {
    try {
      return ReactEditor.toDOMNode(editor, element);
    } catch {
      return null;
    }
  };

  const anchorOf = (current: LinkPanelState): Anchor | null => {
    try {
      if (current.mode === "view" || current.mode === "edit") {
        const element = linkDom(current.element);
        if (!element) return null;
        const y = current.pointerY ?? caretY(element);
        const rect = pickLine([...element.getClientRects()], y) ?? element.getBoundingClientRect();
        return { rect, prefer: "below" };
      }
      if (current.mode === "create" || current.mode === "notice") {
        const range = current.range.current;
        if (!range) return null;
        const domRange = ReactEditor.toDOMRange(editor, range);
        const lines = [...domRange.getClientRects()].filter(rect => rect.width || rect.height);
        const prefer = current.mode === "create" ? current.placement : "below";
        const rect =
          (prefer === "above" ? lines[0] : lines[lines.length - 1]) ??
          domRange.getBoundingClientRect();
        return { rect, prefer };
      }
    } catch {
      return null;
    }
    return null;
  };

  /** 贴锚点定位并同步尺寸；animate 时位置与宽高平滑过渡（热切换、模式形变） */
  const place = useMemoizedFn((animate: boolean) => {
    const box = positionerRef.current;
    const content = contentRef.current;
    if (!box || !content || !open) return;
    const anchor = anchorOf(state);
    if (!anchor) {
      // 锚点已不在文档里（被删除或协作端改写）
      if (state.mode === "view" || state.mode === "edit") controller.close();
      return;
    }
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    const { rect, prefer } = anchor;
    const left = Math.min(
      Math.max(VIEWPORT_EDGE, rect.left - 6),
      window.innerWidth - width - VIEWPORT_EDGE
    );
    const below = rect.bottom + GAP;
    const above = rect.top - GAP - height;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_EDGE;
    const top =
      prefer === "above"
        ? above >= VIEWPORT_EDGE
          ? above
          : below
        : fitsBelow || above < VIEWPORT_EDGE
          ? below
          : above;

    const instant = !animate || !settledRef.current;
    if (instant) box.style.transition = "none";
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.dataset.side = top < rect.top ? "top" : "bottom";
    if (instant) {
      void box.offsetWidth;
      box.style.transition = "";
    }
    settledRef.current = true;
  });

  useLayoutEffect(() => {
    if (open) place(true);
  }, [open, state, place]);

  useEffect(() => {
    if (!open) return;
    const content = contentRef.current;
    const observer =
      typeof ResizeObserver === "undefined" || !content
        ? null
        : new ResizeObserver(() => place(true));
    if (observer && content) observer.observe(content);
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(false));
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, place]);

  useEffect(() => {
    if (state.mode !== "create") return;
    const range = state.range.current;
    const registry = (globalThis.CSS as { highlights?: HighlightRegistry } | undefined)?.highlights;
    const Highlight = (globalThis as { Highlight?: HighlightCtor }).Highlight;
    if (!range || Range.isCollapsed(range) || !registry || !Highlight) return;
    try {
      registry.set(PENDING_HIGHLIGHT, new Highlight(ReactEditor.toDOMRange(editor, range)));
    } catch {
      return;
    }
    return () => registry.delete(PENDING_HIGHLIGHT);
  }, [state, editor]);

  const focusAt = (at: BaseSelection | Path | null) => {
    ReactEditor.focus(editor);
    try {
      if (Array.isArray(at)) selectAfterLink(editor, at);
      else if (at) Transforms.select(editor, at);
    } catch {
      // 选区已失效时只保留焦点
    }
  };

  const unlink = useMemoizedFn((element: LinkElement) => {
    const path = pathOf(element);
    if (!path) return controller.close();
    controller.showNotice(unlinkAt(editor, path), element.url);
  });

  const commitEdit = useMemoizedFn(
    (value: { url: string; text?: string } | undefined, source: CommitSource) => {
      const current = controller.getState();
      if (current.mode !== "edit") return;
      const path = pathOf(current.element);
      if (!path || !value || isInvalidLinkUrl(value.url)) return controller.close();
      if (!normalizeLinkUrl(value.url)) return unlink(current.element);
      updateLink(editor, path, value);
      controller.close();
      if (source === "enter") focusAt(path);
    }
  );

  const cancelEdit = useMemoizedFn(() => {
    const current = controller.getState();
    if (current.mode !== "edit") return;
    controller.close();
    focusAt(current.restore ?? pathOf(current.element));
  });

  const cancelCreate = useMemoizedFn(() => {
    const current = controller.getState();
    if (current.mode !== "create") return;
    const range = current.range.current;
    controller.close();
    focusAt(range);
  });

  const commitCreate = useMemoizedFn((url: string, source: CommitSource) => {
    const current = controller.getState();
    if (current.mode !== "create") return;
    const range = current.range.current;
    if (!url.trim() && source === "enter") return cancelCreate();
    if (!range || !url.trim() || isInvalidLinkUrl(url)) return controller.close();
    if (source === "enter") ReactEditor.focus(editor);
    Transforms.select(editor, range);
    wrapLink(editor, url);
    controller.close();
  });

  const undoUnlink = useMemoizedFn(() => {
    const current = controller.getState();
    if (current.mode !== "notice") return;
    relinkRange(editor, current.range.current, current.url);
    controller.close();
  });

  const dismiss = useMemoizedFn(() => {
    const { mode } = controller.getState();
    if (mode === "edit") cancelEdit();
    else if (mode === "create") cancelCreate();
    else controller.close();
  });

  // 点外面：编辑 / 新建按「完成」处理，其余收起
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as globalThis.Node | null;
      if (target && positionerRef.current?.contains(target)) return;
      const current = controller.getState();
      if (current.mode === "edit") commitEdit(formRef.current?.read(), "outside");
      else if (current.mode === "create")
        commitCreate(formRef.current?.read().url ?? "", "outside");
      else if (current.mode === "view" && target && linkDom(current.element)?.contains(target))
        return;
      else controller.close();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
    // linkDom 只依赖稳定的 editor，提交函数经 useMemoizedFn 保持引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, controller, commitEdit, commitCreate]);

  if (readOnly || display.mode === "closed") return null;

  const renderContent = () => {
    switch (display.mode) {
      case "view": {
        const { element } = display;
        return (
          <LinkView
            url={element.url}
            onOpen={() => {
              openLink(element.url);
              controller.close();
            }}
            onCopy={() =>
              navigator.clipboard.writeText(element.url).then(
                () => true,
                () => {
                  notifier.error("复制失败");
                  return false;
                }
              )
            }
            onEdit={() => controller.openEdit(element)}
            onUnlink={() => unlink(element)}
          />
        );
      }
      case "edit": {
        const { element } = display;
        return (
          <LinkEdit
            url={element.url}
            text={isPlainLink(element) ? Node.string(element) : undefined}
            handleRef={formRef}
            onSubmit={value => commitEdit(value, "enter")}
            onCancel={cancelEdit}
            onUnlink={() => unlink(element)}
          />
        );
      }
      case "create":
        return (
          <LinkCreate
            handleRef={formRef}
            onSubmit={url => commitCreate(url, "enter")}
            onCancel={cancelCreate}
          />
        );
      case "notice":
        return <LinkNotice onUndo={undoUnlink} />;
    }
  };

  const shownNow = open && visible;

  return createPortal(
    <>
      <OverlayBackDismiss open={open} onDismiss={dismiss} />
      {display.mode === "create" && (
        <style>{`::highlight(${PENDING_HIGHLIGHT}){background-color:var(--ed-accent-soft)}`}</style>
      )}
      <div
        ref={positionerRef}
        className={cn(
          "group/link-panel fixed left-0 top-0 z-[10050]",
          "transition-[left,top,width,height] duration-[240ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
          !open && "pointer-events-none"
        )}
        onMouseEnter={() => controller.panelEnter()}
        onMouseLeave={() => controller.panelLeave()}
        onMouseDown={e => {
          // 点按钮不夺走编辑器焦点与选区；输入框照常聚焦
          if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
        }}
      >
        <div
          className={cn(
            "h-full w-full overflow-hidden rounded-[12px] border border-[var(--ed-border)] bg-[var(--ed-bg-surface)]",
            "text-[13px] leading-normal text-[var(--ed-text)] shadow-[var(--ed-shadow-float)]",
            "transition-[opacity,transform] duration-150 ease-[cubic-bezier(.34,1.36,.64,1)] motion-reduce:transition-none",
            shownNow
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-1 scale-[0.97] opacity-0 group-data-[side=top]/link-panel:-translate-y-1"
          )}
        >
          <div ref={contentRef} key={contentKey(display)} className="w-max">
            {renderContent()}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
