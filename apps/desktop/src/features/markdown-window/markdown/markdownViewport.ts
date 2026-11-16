import { flushSync } from "react-dom";
import { Element, Node, type Descendant, type Editor } from "slate";
import { ReactEditor } from "slate-react";

function withinRenderBudget(
  value: unknown,
  budget: { values: number; characters: number }
): boolean {
  if (--budget.values < 0) return false;
  if (typeof value === "string") budget.characters -= value.length;
  else if (Array.isArray(value)) {
    for (const child of value) if (!withinRenderBudget(child, budget)) return false;
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) if (!withinRenderBudget(child, budget)) return false;
  }
  return budget.characters >= 0;
}

export function needsMarkdownViewport(content: readonly Descendant[]): boolean {
  return content.length > 120 || !withinRenderBudget(content, { values: 6000, characters: 50000 });
}

export function estimatedBlockHeight(node: Descendant): number {
  if (Element.isElement(node)) {
    if (node.type === "table") {
      return (
        24 +
        node.children.reduce((height, row) => {
          if (!Element.isElement(row)) return height + 36;
          const lines = Math.max(
            1,
            ...row.children.map(cell => Math.ceil(Node.string(cell).length / 32))
          );
          return height + 20 + lines * 20;
        }, 0)
      );
    }
    if (node.type === "code-block" && typeof node.code === "string") {
      return 56 + Math.min(28, node.code.split("\n").length) * 21;
    }
    if (node.type === "image") return 264;
    if (node.type === "header") return 64;
  }
  return 24 + 24 * Math.max(1, Math.ceil(Node.string(node).length / 52));
}

export function initialBlockCount(content: readonly Descendant[], height: number): number {
  let remaining = Math.max(640, height) + 240;
  let count = 0;
  for (const node of content) {
    count++;
    remaining -= estimatedBlockHeight(node);
    if (remaining <= 0) break;
  }
  return count;
}

export function createMarkdownViewport() {
  interface Block {
    element: HTMLElement;
    near: boolean;
    height: number | undefined;
  }
  const blocks = new Map<string, Block>();
  const byElement = new Map<HTMLElement, string>();
  const listeners = new Map<string, () => void>();
  const temporary = new Set<string>();
  const timers = new Map<string, number>();
  let selection = new Set<string>();
  let focus: string | null = null;
  let dragAnchor: string | undefined;
  let findTarget: string | undefined;
  let observer: IntersectionObserver | null = null;
  let fullDocument = false;

  const keyForIndex = (editor: Editor, index: number) => {
    const node = editor.children[index];
    return node ? ReactEditor.findKey(editor, node).id : undefined;
  };
  const notify = (key: string) => listeners.get(key)?.();
  const isMounted = (key: string, initial: boolean) =>
    fullDocument ||
    (blocks.get(key)?.near ?? initial) ||
    temporary.has(key) ||
    selection.has(key) ||
    focus === key ||
    dragAnchor === key ||
    findTarget === key;

  return {
    subscribe(key: string, listener: () => void) {
      listeners.set(key, listener);
      return () => {
        listeners.delete(key);
      };
    },
    isMounted,
    setFullDocument(enabled: boolean) {
      if (fullDocument === enabled) return;
      fullDocument = enabled;
      for (const listener of listeners.values()) listener();
    },
    height: (key: string) => blocks.get(key)?.height,
    register(key: string, element: HTMLElement, near: boolean) {
      blocks.set(key, { element, near, height: undefined });
      byElement.set(element, key);
      observer?.observe(element);
      return () => {
        observer?.unobserve(element);
        byElement.delete(element);
        blocks.delete(key);
        window.clearTimeout(timers.get(key));
        timers.delete(key);
        temporary.delete(key);
        selection.delete(key);
        if (focus === key) focus = null;
      };
    },
    observe(root: HTMLElement) {
      observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const key = byElement.get(entry.target as HTMLElement);
            const block = key === undefined ? undefined : blocks.get(key);
            if (key === undefined || !block || block.near === entry.isIntersecting) continue;
            if (!entry.isIntersecting && entry.boundingClientRect.height > 0) {
              block.height = entry.boundingClientRect.height;
            }
            block.near = entry.isIntersecting;
            notify(key);
          }
        },
        { root, rootMargin: "520px 0px" }
      );
      for (const block of blocks.values()) observer.observe(block.element);
      return () => {
        observer?.disconnect();
        observer = null;
      };
    },
    updateSelection(editor: Editor) {
      const indexes = [editor.selection?.anchor.path[0], editor.selection?.focus.path[0]];
      const next = new Set(
        indexes.flatMap(index => {
          const key = index === undefined ? undefined : keyForIndex(editor, index);
          return key === undefined ? [] : [key];
        })
      );
      const previous = selection;
      selection = next;
      for (const key of previous) if (!next.has(key)) notify(key);
      for (const key of next) if (!previous.has(key)) notify(key);
    },
    pinDragAnchor(editor: Editor, index?: number) {
      const next = index === undefined ? undefined : keyForIndex(editor, index);
      if (dragAnchor === next) return;
      const previous = dragAnchor;
      dragAnchor = next;
      if (previous !== undefined) notify(previous);
      if (next !== undefined) notify(next);
    },
    setFocus(key: string, active: boolean) {
      if (!active && focus !== key) return;
      const previous = focus;
      focus = active ? key : null;
      if (previous) notify(previous);
      if (focus && focus !== previous) notify(focus);
    },
    prepare(editor: Editor, indexes: number[]) {
      const keys = indexes.flatMap(index => {
        const key = keyForIndex(editor, index);
        const mounted =
          key !== undefined &&
          isMounted(key, false) &&
          blocks.get(key)?.element.dataset.markdownViewportBlock === "mounted";
        return key === undefined || mounted ? [] : [key];
      });
      if (!keys.length) return;
      flushSync(() => {
        for (const key of keys) {
          temporary.add(key);
          notify(key);
          window.clearTimeout(timers.get(key));
          timers.set(
            key,
            window.setTimeout(() => {
              timers.delete(key);
              temporary.delete(key);
              notify(key);
            }, 400)
          );
        }
      });
    },
    retainFindTarget(editor: Editor, index: number) {
      const key = keyForIndex(editor, index);
      if (key === undefined) return;
      const mounted =
        isMounted(key, false) &&
        blocks.get(key)?.element.dataset.markdownViewportBlock === "mounted";
      findTarget = key;
      if (!mounted) flushSync(() => notify(key));
      return () => {
        if (findTarget !== key) return;
        findTarget = undefined;
        notify(key);
      };
    },
    anchor(editor: Editor, node: Descendant) {
      return blocks.get(ReactEditor.findKey(editor, node).id)?.element ?? null;
    },
    hasSpacers(editor: Editor, start: number, end: number) {
      for (let index = start; index <= end; index++) {
        const key = keyForIndex(editor, index);
        if (key !== undefined && !isMounted(key, false)) return true;
      }
      return false;
    },
  };
}

export type MarkdownViewport = ReturnType<typeof createMarkdownViewport>;
