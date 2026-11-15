import type { Editor as CodeMirrorEditor } from "codemirror";
import { Element, Node, Text, type Descendant, type Editor, type Path, type Point } from "slate";
import { ReactEditor } from "slate-react";
import { revealCodeStep } from "@tau/editor/extensions/code-block/runtime";
import type { FindResults } from "@/components/GlobalFindBar/findOwner";
import { showFindHighlights } from "@/components/GlobalFindBar/highlights";
import type { MarkdownViewport } from "./markdownViewport";
import { scrollSourceCursorIntoView } from "./scrollSourceCursorIntoView";

export const emptyFindResults: FindResults = { count: 0, reveal: () => undefined };

function literalPattern(query: string) {
  return new RegExp(query.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"), "giu");
}

interface TextSpan {
  path: Path;
  start: number;
  end: number;
}

type SearchUnit =
  | { text: string; spans: TextSpan[] }
  | { text: string; code: { path: Path; step?: number } };

function collectBlockUnits(editor: Editor, block: Descendant): SearchUnit[] {
  const units: SearchUnit[] = [];
  let text = "";
  let spans: TextSpan[] = [];
  const flush = () => {
    if (text) units.push({ text, spans });
    text = "";
    spans = [];
  };
  const visit = (node: Descendant, path: Path) => {
    if (Text.isText(node)) {
      if (node.text) {
        spans.push({ path, start: text.length, end: text.length + node.text.length });
        text += node.text;
      }
      return;
    }
    if (node.type === "code-block") {
      flush();
      const steps = node.children.flatMap((child, step) =>
        child.type === "code-step" ? [{ text: child.code, code: { path, step } }] : []
      );
      if (steps.length) units.push(...steps);
      else if ("code" in node && node.code) units.push({ text: node.code, code: { path } });
      return;
    }
    const boundary = !editor.isInline(node) || editor.isVoid(node);
    if (boundary) flush();
    if (!editor.isVoid(node)) node.children.forEach((child, i) => visit(child, [...path, i]));
    if (boundary) flush();
  };
  visit(block, []);
  flush();
  return units;
}

function pointAt(block: number, spans: TextSpan[], offset: number, end: boolean): Point | null {
  const span = spans.find(span =>
    end ? offset > span.start && offset <= span.end : offset >= span.start && offset < span.end
  );
  return span ? { path: [block, ...span.path], offset: offset - span.start } : null;
}

function scrollToRange(range: Range, scrollEl: HTMLElement | null) {
  if (!scrollEl) return false;
  for (let el = range.startContainer.parentElement; el && el !== scrollEl; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth || !/auto|scroll/.test(getComputedStyle(el).overflowX))
      continue;
    const rect = range.getBoundingClientRect();
    const screen = el.getBoundingClientRect();
    if (rect.left < screen.left || rect.right > screen.right) {
      el.scrollLeft += rect.left - screen.left - (el.clientWidth - rect.width) / 2;
    }
  }
  const rect = range.getBoundingClientRect();
  if (!rect.height) return false;
  const screen = scrollEl.getBoundingClientRect();
  const y = rect.top - screen.top - scrollEl.clientTop - (scrollEl.clientHeight - rect.height) / 2;
  scrollEl.scrollTop += y;
  return true;
}

function revealFoldedTarget(element: HTMLElement | null, scrollEl: HTMLElement | null) {
  const hidden: HTMLElement[] = [];
  for (let el = element; el && el !== scrollEl; el = el.parentElement) {
    if (el.style.display === "none" || (el.style.height === "0px" && el.style.opacity === "0")) {
      el.setAttribute("data-markdown-find-reveal", "");
      hidden.push(el);
    }
  }
  return () => {
    for (const el of hidden) el.removeAttribute("data-markdown-find-reveal");
  };
}

function codeDomRange(element: HTMLElement, start: number, end: number): Range | undefined {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let offset = 0;
  let began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const stop = offset + (node.textContent?.length ?? 0);
    if (!began && stop > start) {
      range.setStart(node, start - offset);
      began = true;
    }
    if (began && stop >= end) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset = stop;
  }
}

export function createRichFind() {
  let indexedEditor: Editor | undefined;
  let cache = new WeakMap<Descendant, SearchUnit[]>();
  return (
    editor: Editor,
    query: string,
    viewport: MarkdownViewport | undefined,
    scrollEl: HTMLElement | null
  ): FindResults => {
    if (editor !== indexedEditor) {
      indexedEditor = editor;
      cache = new WeakMap();
    }
    const children = editor.children;
    const pattern = literalPattern(query);
    const matches: { block: number; unit: SearchUnit; start: number; end: number }[] = [];
    children.forEach((block, index) => {
      let units = cache.get(block);
      if (!units) {
        units = collectBlockUnits(editor, block);
        cache.set(block, units);
      }
      for (const unit of units) {
        for (const match of unit.text.matchAll(pattern)) {
          matches.push({
            block: index,
            unit,
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }
    });
    return {
      count: matches.length,
      reveal(index, scroll) {
        const match = matches[index];
        if (!match || editor.children !== children) return;
        const { block, unit, start, end } = match;
        const release = scroll ? viewport?.retainFindTarget(editor, block) : undefined;
        try {
          if ("spans" in unit) {
            const anchor = pointAt(block, unit.spans, start, false);
            const focus = pointAt(block, unit.spans, end, true);
            if (!anchor || !focus) return release;
            const range = ReactEditor.toDOMRange(editor, { anchor, focus });
            const restore = revealFoldedTarget(range.startContainer.parentElement, scrollEl);
            showFindHighlights(range);
            if (scroll) scrollToRange(range, scrollEl);
            return () => {
              restore();
              release?.();
            };
          }
          const node = Node.get(editor, [block, ...unit.code.path]);
          if (!Element.isElement(node) || node.type !== "code-block") return release;
          const slot = unit.code.path.length === 0 ? viewport?.anchor(editor, node) : null;
          const root = slot ?? ReactEditor.toDOMNode(editor, node);
          const restore = revealFoldedTarget(root, scrollEl);
          if (scroll) {
            revealCodeStep(editor, node, unit.code.step);
            root.scrollIntoView({ block: "center", inline: "nearest" });
          }
          let scrolled = false;
          let frame = 0;
          const showCode = () => {
            frame = 0;
            if (editor.children !== children) return;
            const code = root.querySelector<HTMLElement>(".code-block-shiki-layer code");
            if (!code?.textContent?.startsWith(unit.text.slice(0, end))) return;
            const range = codeDomRange(code, start, end);
            if (!range) return;
            showFindHighlights(range);
            if (scroll && !scrolled) scrolled = scrollToRange(range, scrollEl);
          };
          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(showCode);
          };
          // 代码块的词法高亮可能晚于块挂载，等文本层更新后再映射命中范围。
          const observer = new MutationObserver(schedule);
          observer.observe(root, { subtree: true, childList: true, characterData: true });
          const geometry = new ResizeObserver(schedule);
          geometry.observe(root);
          schedule();
          return () => {
            observer.disconnect();
            geometry.disconnect();
            cancelAnimationFrame(frame);
            restore();
            release?.();
          };
        } catch {
          // 编辑后的命中也可能在已回收的块中，下一次显式定位才挂载。
          release?.();
        }
      },
    };
  };
}

export function findSourceText(
  editor: CodeMirrorEditor,
  query: string,
  outerScroll: HTMLElement | null
): FindResults {
  const text = editor.getValue();
  const matches = [...text.matchAll(literalPattern(query))].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  return {
    count: matches.length,
    reveal(index, scroll) {
      const match = matches[index];
      if (!match || editor.getValue() !== text) return;
      const from = editor.posFromIndex(match.start);
      const to = editor.posFromIndex(match.end);
      const mark = editor.markText(from, to, { className: "tau-source-find-current" });
      if (scroll) {
        editor.scrollIntoView({ from, to }, 24);
        if (outerScroll) scrollSourceCursorIntoView(editor, outerScroll, from);
      }
      return () => mark.clear();
    },
  };
}
