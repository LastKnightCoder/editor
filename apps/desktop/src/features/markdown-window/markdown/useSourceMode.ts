import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node,
  Point,
  Text,
  Transforms,
  type Descendant,
} from "slate";
import { ReactEditor } from "slate-react";
import type { Editor as CodeMirrorEditor } from "codemirror";
import { useMemoizedFn } from "ahooks";
import type { EditorRef } from "@tau/editor";
import { getCodeBlockController, revealCodeStep } from "@tau/editor/extensions/code-block/runtime";
import { importFromMarkdownWithPositions } from "@/utils/markdown";
import { getCodeCaretRange, scrollRichCaretIntoView, translateCaret } from "./markdownCaret";
import { scrollSourceCursorIntoView } from "./scrollSourceCursorIntoView";

type SlatePoint = { path: number[]; offset: number };
type SlateInstance = ReturnType<EditorRef["getEditor"]>;

const FOCUS_WAIT_MS = 2000;

interface ReturnTarget {
  content: Descendant[];
  point: SlatePoint | null;
  code?: { path: number[]; cursor: { line: number; ch: number } };
  owner: Element | null;
}

function ownsFocus(owner: Element | null, source?: HTMLElement) {
  const active = document.activeElement;
  return (
    !active ||
    active === owner ||
    active === document.body ||
    active === document.documentElement ||
    (source?.classList.contains("CodeMirror") && source.contains(active))
  );
}

/** 把可能越界的点夹到最近的合法位置 */
function resolveSlatePoint(editor: SlateInstance, point: SlatePoint | null) {
  if (!point) return null;
  if (SlateEditor.hasPath(editor, point.path)) {
    try {
      const [node] = SlateEditor.node(editor, point.path);
      if (Text.isText(node))
        return { path: point.path, offset: Math.min(point.offset, node.text.length) };
    } catch {
      return null;
    }
    return SlateEditor.start(editor, point.path);
  }
  for (let i = point.path.length - 1; i >= 0; i -= 1) {
    const basePath = point.path.slice(0, i);
    if (!SlateEditor.hasPath(editor, basePath)) continue;
    const [node] = SlateEditor.node(editor, basePath);
    if (Text.isText(node))
      return { path: basePath, offset: Math.min(point.offset, node.text.length) };
    const children = (node as { children?: unknown[] }).children;
    if (Array.isArray(children) && children.length > 0) {
      const clamped = Math.min(
        Math.max(point.path[i] ?? children.length - 1, 0),
        children.length - 1
      );
      const candidate = [...basePath, clamped];
      if (SlateEditor.hasPath(editor, candidate)) {
        const [child] = SlateEditor.node(editor, candidate);
        return Text.isText(child)
          ? { path: candidate, offset: Math.min(point.offset, child.text.length) }
          : SlateEditor.end(editor, candidate);
      }
    }
    return SlateEditor.end(editor, basePath);
  }
  return null;
}

export function useSourceMode({
  editorRef,
  getText,
  applySource,
  stopCapturing,
  richReady = true,
  prepareRichTarget,
  scrollEl,
  sourceWindowed,
}: {
  editorRef: RefObject<EditorRef | null>;
  getText: () => string;
  applySource: (text: string, parsed: Descendant[]) => boolean;
  stopCapturing: () => void;
  richReady?: boolean;
  prepareRichTarget?: (index: number) => void;
  scrollEl: HTMLElement | null;
  sourceWindowed: boolean;
}) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceCreated, setSourceCreated] = useState(false);
  const [focusRequest, requestFocus] = useState(0);
  const sourceEditorRef = useRef<CodeMirrorEditor | null>(null);
  const sourceTextRef = useRef("");
  const returnTarget = useRef<ReturnTarget | null>(null);
  const lastEditorFocus = useRef<SlatePoint | null>(null);
  const sourceTarget = useRef<{
    point: { line: number; ch: number } | null;
    owner: Element | null;
  } | null>(null);

  const enterSource = () => {
    returnTarget.current = null;
    const editor = editorRef.current?.getEditor();
    const active = document.activeElement;
    const activeElement = active instanceof HTMLElement ? active : null;
    let point = editor?.selection?.focus;
    let codePath: number[] | undefined;
    let codeCursor: { line: number; ch: number } | undefined;
    if (editor && activeElement?.closest('[data-slate-editor="true"]')) {
      try {
        if (activeElement.matches("textarea.code-block-shiki-input")) {
          const block = activeElement.closest('[data-slate-node="element"]');
          const node = block && ReactEditor.toSlateNode(editor, block);
          if (SlateElement.isElement(node) && node.type === "code-block") {
            codePath = ReactEditor.findPath(editor, node);
            codeCursor = getCodeBlockController(node.uuid)?.getCursor();
          }
        } else {
          const selection = window.getSelection();
          if (selection)
            point =
              ReactEditor.toSlateRange(editor, selection, {
                exactMatch: false,
                suppressThrow: true,
              })?.focus ?? point;
        }
      } catch {
        // 切换前的 DOM 已被外部更新，沿用编辑器选区。
      }
    }
    if (editor && point && !codeCursor) {
      const entry = SlateEditor.above(editor, {
        at: point,
        match: node => SlateElement.isElement(node) && node.type === "code-block",
      });
      const block = entry?.[0];
      if (entry && SlateElement.isElement(block) && block.type === "code-block") {
        codePath = entry[1];
        codeCursor = getCodeBlockController(block.uuid)?.getCursor();
      }
    }
    lastEditorFocus.current = point ?? null;
    stopCapturing();
    const markdown = getText();
    let target: { line: number; ch: number } | null = null;
    if (editor && (point || codeCursor)) {
      try {
        const { content, positionMap } = importFromMarkdownWithPositions(markdown);
        if (codePath && codeCursor) {
          const parsed = translateCaret(editor.children, content, { path: codePath, offset: 0 });
          const path = parsed?.path ?? codePath;
          const range =
            positionMap.getElementMappingBySlatePath(path)?.propertyMappings?.code ??
            positionMap.getElementMappingBySlatePath([...path, 0])?.propertyMappings?.code;
          if (range)
            target = {
              line: range.mdStartLine + codeCursor.line,
              ch: (range.mdLineColumns?.[codeCursor.line] ?? range.mdStartCh) + codeCursor.ch,
            };
        }
        if (!target && point) {
          const parsed = translateCaret(editor.children, content, point);
          if (parsed) target = positionMap.slateToMarkdown(parsed);
        }
      } catch {
        // 原文解析失败时仍可进入源码修复。
      }
    }
    sourceTextRef.current = markdown;
    const code = sourceEditorRef.current;
    if (code && code.getValue() !== markdown) code.setValue(markdown);
    sourceTarget.current = { point: target, owner: active };
    if (
      editor &&
      activeElement?.closest('[data-slate-editor="true"]') &&
      ReactEditor.hasDOMNode(editor, activeElement)
    )
      activeElement.blur();
    setSourceCreated(true);
    setSourceMode(true);
  };

  useEffect(() => {
    const target = sourceTarget.current;
    if (!sourceMode || !target) return;
    let frame = 0;
    const started = performance.now();
    const restore = () => {
      const code = sourceEditorRef.current;
      if (sourceTarget.current !== target || !ownsFocus(target.owner, code?.getWrapperElement()))
        return;
      if (!code) {
        if (performance.now() - started < FOCUS_WAIT_MS) frame = requestAnimationFrame(restore);
        return;
      }
      code.refresh();
      if (target.point) code.setCursor(target.point);
      code.focus();
      if (sourceWindowed) code.scrollIntoView(code.getCursor(), 24);
      else if (scrollEl) scrollSourceCursorIntoView(code, scrollEl);
      sourceTarget.current = null;
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [sourceMode, scrollEl, sourceWindowed]);

  const leaveSource = () => {
    sourceTarget.current = null;
    const editor = sourceEditorRef.current;
    const cursor = editor?.getCursor();
    const markdown = editor?.getValue() ?? sourceTextRef.current;
    const { content, positionMap } = importFromMarkdownWithPositions(markdown);
    if (!applySource(markdown, content)) return;
    stopCapturing();
    const mapped = cursor ? positionMap.markdownToSlate(cursor) : null;
    const hint = cursor ? positionMap.getElementPropertyByMarkdown(cursor) : null;
    const codePath =
      hint?.mapping.elementType === "code-step"
        ? hint.mapping.slateElementPath.slice(0, -1)
        : hint?.mapping.elementType === "code-block"
          ? hint.mapping.slateElementPath
          : null;
    returnTarget.current = {
      content,
      point: mapped,
      ...(codePath && {
        code: {
          path: codePath,
          cursor:
            hint?.propertyName === "code" && hint.relativePos
              ? { line: hint.relativePos.line, ch: hint.relativePos.ch }
              : { line: 0, ch: 0 },
        },
      }),
      owner: document.activeElement,
    };
    requestFocus(value => value + 1);
    setSourceMode(false);
  };

  const toggle = useMemoizedFn(() => {
    if (!sourceMode) {
      enterSource();
      return;
    }
    try {
      leaveSource();
    } catch (error) {
      console.error("解析 Markdown 失败:", error);
    }
  });

  useEffect(() => {
    const request = returnTarget.current;
    if (sourceMode || !richReady || !request) return;
    const started = performance.now();
    let frame = 0;
    let revealedCode = false;
    let selected: { editor: SlateInstance; point: SlatePoint } | undefined;
    let settling: AbortController | undefined;
    const retry = () => {
      if (performance.now() - started < FOCUS_WAIT_MS) frame = requestAnimationFrame(restore);
      else returnTarget.current = null;
    };
    const finish = (
      target: HTMLElement,
      focus: Element,
      caret?: () => globalThis.Range | undefined
    ) => {
      returnTarget.current = null;
      const startedAt = performance.now();
      settling = new AbortController();
      const { signal } = settling;
      const stop = () => settling?.abort();
      for (const event of ["wheel", "pointerdown", "keydown"]) {
        window.addEventListener(event, stop, { capture: true, passive: true, signal });
      }
      const settle = () => {
        if (signal.aborted || !target.isConnected || document.activeElement !== focus)
          return stop();
        try {
          const range = caret?.();
          if (!caret || range) scrollRichCaretIntoView(target, scrollEl, range);
          else return stop();
        } catch {
          return stop();
        }
        if (performance.now() - startedAt < 250) frame = requestAnimationFrame(settle);
        else stop();
      };
      settle();
    };
    const restore = () => {
      if (request !== returnTarget.current) return;
      if (!ownsFocus(request.owner, sourceEditorRef.current?.getWrapperElement())) {
        returnTarget.current = null;
        return;
      }
      const editor = editorRef.current?.getEditor();
      if (!editor) return retry();
      const translated =
        request.point && translateCaret(request.content, editor.children, request.point);
      const point = resolveSlatePoint(
        editor,
        translated ?? request.point ?? lastEditorFocus.current
      );
      if (!point) {
        returnTarget.current = null;
        return;
      }

      try {
        prepareRichTarget?.(point.path[0]);
        if (request.code) {
          const parsed = { path: request.code.path, offset: 0 };
          const live =
            translateCaret(request.content, editor.children, parsed)?.path ?? parsed.path;
          const node = Node.getIf(editor, live);
          if (SlateElement.isElement(node) && node.type === "code-block") {
            const host = ReactEditor.toDOMNode(editor, node);
            if (!revealedCode) {
              revealCodeStep(editor, node, 0);
              scrollRichCaretIntoView(host, scrollEl);
              revealedCode = true;
            }
            const code = getCodeBlockController(node.uuid);
            if (!code && performance.now() - started < FOCUS_WAIT_MS) return retry();
            if (code) {
              const line = Math.min(request.code.cursor.line, code.lastLine());
              const ch = Math.min(request.code.cursor.ch, code.getLine(line).length);
              Transforms.select(editor, point);
              code.setCursor({ line, ch });
              const active = document.activeElement;
              if (active instanceof HTMLElement && host.contains(active)) {
                const input = active instanceof HTMLTextAreaElement ? active : undefined;
                const offset = input?.selectionStart;
                const caret =
                  input && getCodeCaretRange(input)
                    ? () => (input.selectionStart === offset ? getCodeCaretRange(input) : undefined)
                    : undefined;
                finish(active, active, caret);
                return;
              }
              return retry();
            }
          }
        }
        ReactEditor.toDOMRange(editor, { anchor: point, focus: point });
        if (selected?.editor !== editor || !Point.equals(selected.point, point)) {
          Transforms.select(editor, point);
          selected = { editor, point };
        }
        if (editor.operations.length) return retry();
        ReactEditor.focus(editor);
        const root = ReactEditor.toDOMNode(editor, editor);
        if (document.activeElement !== root) root.focus({ preventScroll: true });
        const selection = editor.selection ?? { anchor: point, focus: point };
        const range = ReactEditor.toDOMRange(editor, selection);
        window
          .getSelection()
          ?.setBaseAndExtent(
            range.startContainer,
            range.startOffset,
            range.endContainer,
            range.endOffset
          );
        const leaf = range.startContainer.parentElement;
        if (leaf)
          finish(leaf, root, () => {
            const current = editor.selection;
            return current && Point.equals(current.focus, selection.focus)
              ? ReactEditor.toDOMRange(editor, current)
              : undefined;
          });
        else returnTarget.current = null;
      } catch {
        // 视口块与代码输入器可能在下一帧才提交。
        retry();
      }
    };
    frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      settling?.abort();
    };
  }, [focusRequest, sourceMode, richReady, prepareRichTarget, editorRef, scrollEl]);

  return {
    sourceMode,
    sourceCreated,
    toggle,
    showSource: useMemoizedFn(enterSource),
    sourceEditorRef,
    sourceTextRef,
  };
}
