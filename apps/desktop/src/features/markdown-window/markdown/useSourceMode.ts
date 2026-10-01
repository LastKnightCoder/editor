/**
 * 富文本 ⇄ 源码切换与光标双向映射（逻辑沿用旧 Markdown 窗口）：
 * - 富文本 → 源码：读取文档原文并解析位置表；光标在代码块内时取代码块
 *   内部控制器的光标换算，否则按 Slate 点映射；
 * - 源码 → 富文本：importFromMarkdownWithPositions 解析；落在代码块内时等代码块编辑器挂载后
 *   把光标放回代码块（最多等 2s），否则按映射点 / 进入源码前的位置聚焦（路径越界时就近夹取）。
 * 两个视图常驻，源码回写经同一文档会话进入 Y.Doc。
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
import type { EditorRef } from "@tau/editor";
import { getCodeBlockController } from "@tau/editor-code-block/runtime";
import { importFromMarkdownWithPositions } from "@/utils/markdown";

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
  getText,
  applySource,
  stopCapturing,
}: {
  editorRef: RefObject<EditorRef | null>;
  getText: () => string;
  applySource: (text: string) => boolean;
  stopCapturing: () => void;
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

    stopCapturing();
    const markdown = getText();
    let positionMap: ReturnType<typeof importFromMarkdownWithPositions>["positionMap"] | undefined;
    try {
      positionMap = importFromMarkdownWithPositions(markdown).positionMap;
    } catch {
      // 原文解析失败时仍可进入源码修复，仅放弃本次光标映射。
    }
    sourceTextRef.current = markdown;
    const source = sourceEditorRef.current;
    if (!source) return;
    source.setValue(markdown);

    if (selection?.focus && editor && positionMap) {
      let target: { line: number; ch: number } | null = null;
      const codeBlock = SlateEditor.above(editor, {
        at: selection.focus,
        match: node => SlateElement.isElement(node) && node.type === "code-block",
      });
      if (codeBlock) {
        const [node, path] = codeBlock as [{ uuid?: string }, number[]];
        const codeEditor = node.uuid ? getCodeBlockController(node.uuid) : null;
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
    if (!applySource(sourceTextRef.current)) return;
    stopCapturing();

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

  // 切回富文本后等待视图显示，再恢复光标。
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
          let codeEditor = focus.uuid ? getCodeBlockController(focus.uuid) : null;
          if (!codeEditor) {
            const [node] = SlateEditor.node(editor, focus.path);
            const uuid = (node as { uuid?: unknown }).uuid;
            if (typeof uuid === "string") {
              pendingCodeBlock.current = { ...focus, uuid };
              codeEditor = getCodeBlockController(uuid);
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

  return {
    sourceMode,
    toggle,
    showSource: useMemoizedFn(enterSource),
    sourceEditorRef,
    sourceTextRef,
  };
}
