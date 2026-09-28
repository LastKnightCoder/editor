/**
 * 富文本 ⇄ 源码切换与光标双向映射（逻辑沿用旧 Markdown 窗口）：
 * - 富文本 → 源码：getMarkdownWithPositions 生成 Markdown 与位置表；光标在代码块内时取代码块
 *   自带 CodeMirror 的光标换算，否则按 Slate 点映射；
 * - 源码 → 富文本：importFromMarkdownWithPositions 解析；落在代码块内时等代码块编辑器挂载后
 *   把光标放回代码块（最多等 2s），否则按映射点 / 进入源码前的位置聚焦（路径越界时就近夹取）。
 * 富文本编辑器在源码模式下卸载，切回时以 initValue 重建。
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Text,
  Transforms,
  type Descendant,
} from "slate";
import { ReactEditor } from "slate-react";
import type { Editor as CodeMirrorEditor } from "codemirror";
import { useMemoizedFn } from "ahooks";
import type { EditorRef } from "@tau/editor/src";
import { codeBlockMap } from "@tau/editor/src/extensions/code-block";
import { getMarkdownWithPositions, importFromMarkdownWithPositions } from "@/utils/markdown";

type SlatePoint = { path: number[]; offset: number };
type SlateInstance = ReturnType<EditorRef["getEditor"]>;

const CODE_BLOCK_FOCUS_RETRY_INTERVAL = 80;
const CODE_BLOCK_FOCUS_MAX_WAIT = 2000;
const FOCUS_DELAY = 100;

function nodeAt(nodes: Descendant[], path: number[]): Descendant | null {
  let current: unknown = { children: nodes };
  for (const index of path) {
    const children = (current as { children?: unknown[] })?.children;
    if (!Array.isArray(children) || !children[index]) return null;
    current = children[index];
  }
  return current as Descendant;
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
  getContent,
  setContent,
}: {
  editorRef: RefObject<EditorRef | null>;
  getContent: () => Descendant[];
  setContent: (content: Descendant[]) => void;
}) {
  const [sourceMode, setSourceMode] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const sourceEditorRef = useRef<CodeMirrorEditor | null>(null);
  const sourceTextRef = useRef("");
  const pendingSelection = useRef<SlatePoint | null>(null);
  const pendingCodeBlock = useRef<{
    path: number[];
    cursor: { line: number; ch: number };
    uuid?: string;
  } | null>(null);
  const pendingFocus = useRef(false);
  const lastEditorFocus = useRef<SlatePoint | null>(null);

  const clearPending = () => {
    pendingCodeBlock.current = null;
    pendingSelection.current = null;
    pendingFocus.current = false;
  };

  const focusFallback = (editor: SlateInstance) => {
    const target = resolveSlatePoint(editor, pendingSelection.current);
    if (target) {
      Transforms.select(editor, { anchor: target, focus: target });
      ReactEditor.focus(editor);
    }
    clearPending();
  };

  const enterSource = () => {
    const editor = editorRef.current?.getEditor();
    const selection = editor?.selection;
    lastEditorFocus.current = selection?.focus
      ? { path: [...selection.focus.path], offset: selection.focus.offset }
      : null;

    const { markdown, positionMap } = getMarkdownWithPositions(getContent());
    sourceTextRef.current = markdown;
    const source = sourceEditorRef.current;
    if (!source) return;
    source.setValue(markdown);

    if (selection?.focus && editor) {
      let target: { line: number; ch: number } | null = null;
      const codeBlock = SlateEditor.above(editor, {
        at: selection.focus,
        match: node => SlateElement.isElement(node) && node.type === "code-block",
      });
      if (codeBlock) {
        const [node, path] = codeBlock as [{ uuid?: string }, number[]];
        const codeEditor = node.uuid ? codeBlockMap.get(node.uuid) : null;
        const codeMapping = positionMap.getElementMappingBySlatePath(path)?.propertyMappings?.code;
        if (codeEditor && codeMapping) {
          const cursor = codeEditor.getCursor();
          target = {
            line: codeMapping.mdStartLine + cursor.line,
            ch: codeMapping.mdStartCh + cursor.ch,
          };
        }
      }
      target ??= positionMap.slateToMarkdown(selection.focus);
      if (target) {
        const position = target;
        setTimeout(() => {
          sourceEditorRef.current?.setCursor(position);
          sourceEditorRef.current?.focus();
        }, FOCUS_DELAY);
      }
    } else {
      setTimeout(() => sourceEditorRef.current?.focus(), FOCUS_DELAY);
    }
    setTimeout(() => sourceEditorRef.current?.refresh(), FOCUS_DELAY + 50);
    setSourceMode(true);
  };

  const leaveSource = () => {
    const cursor = sourceEditorRef.current?.getCursor();
    const { content, positionMap } = importFromMarkdownWithPositions(sourceTextRef.current);
    setContent(content);

    const hint = cursor ? positionMap.getElementPropertyByMarkdown(cursor) : null;
    if (hint?.mapping.elementType === "code-block") {
      const path = [...hint.mapping.slateElementPath];
      const node = nodeAt(content, path) as { uuid?: unknown } | null;
      let codeCursor = hint.propertyName === "code" && hint.relativePos ? hint.relativePos : null;
      const range = hint.mapping.propertyMappings?.code;
      if (!codeCursor && cursor && range) {
        const line = Math.min(Math.max(cursor.line, range.mdStartLine), range.mdEndLine);
        const lineBase = line === range.mdStartLine ? range.mdStartCh : 0;
        const lineEnd = line === range.mdEndLine ? range.mdEndCh : cursor.ch;
        const ch = Math.min(Math.max(cursor.ch, lineBase), Math.max(lineBase, lineEnd));
        codeCursor = {
          line: Math.max(0, line - range.mdStartLine),
          ch: Math.max(0, ch - lineBase),
        };
      }
      pendingCodeBlock.current = {
        path,
        cursor: codeCursor ?? { line: 0, ch: 0 },
        uuid: typeof node?.uuid === "string" ? node.uuid : undefined,
      };
      pendingSelection.current = { path, offset: 0 };
    } else {
      pendingCodeBlock.current = null;
      pendingSelection.current =
        (cursor ? positionMap.markdownToSlate(cursor) : null) ?? lastEditorFocus.current;
    }
    pendingFocus.current = true;
    setFocusRequest(request => request + 1);
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

  // 切回富文本后：编辑器以 initValue 重建完成再放光标
  useEffect(() => {
    if (sourceMode || !pendingFocus.current || focusRequest === 0) return;
    const timer = setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      if (!editor || !pendingFocus.current) {
        clearPending();
        return;
      }
      try {
        if (!pendingCodeBlock.current) {
          focusFallback(editor);
          return;
        }
        const startedAt = Date.now();
        const attempt = () => {
          const focus = pendingCodeBlock.current;
          if (!pendingFocus.current) return;
          if (!focus || !SlateEditor.hasPath(editor, focus.path)) {
            focusFallback(editor);
            return;
          }
          let codeEditor = focus.uuid ? codeBlockMap.get(focus.uuid) : null;
          if (!codeEditor) {
            const [node] = SlateEditor.node(editor, focus.path);
            const uuid = (node as { uuid?: unknown }).uuid;
            if (typeof uuid === "string") {
              pendingCodeBlock.current = { ...focus, uuid };
              codeEditor = codeBlockMap.get(uuid);
            }
          }
          if (!codeEditor) {
            if (Date.now() - startedAt >= CODE_BLOCK_FOCUS_MAX_WAIT) focusFallback(editor);
            else setTimeout(attempt, CODE_BLOCK_FOCUS_RETRY_INTERVAL);
            return;
          }
          const line = Math.min(focus.cursor.line, codeEditor.lastLine());
          const ch = Math.min(focus.cursor.ch, (codeEditor.getLine(line) || "").length);
          codeEditor.focus();
          codeEditor.setCursor({ line, ch });
          clearPending();
        };
        attempt();
      } catch (error) {
        console.error("恢复光标失败:", error);
        clearPending();
      }
    }, FOCUS_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, sourceMode]);

  return { sourceMode, toggle, sourceEditorRef, sourceTextRef };
}
