import React, { useEffect, useMemo, useRef, useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { useNotifier } from "@tau/editor/api";
import isHotkey from "is-hotkey";
import { cn } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import type { HighlighterCore } from "shiki/core";
import { ChevronDown } from "lucide-react";

import type { CodeBlockElement, CodeBlockMagicMove } from "../../../../types";
import {
  AddParagraph,
  type AddParagraphRef,
  ElementMenu,
  useEditorTheme as useTheme,
  useIsLastElement,
} from "@tau/editor/api";
import {
  focusNextBlock,
  focusPreviousBlock,
  registerBlockNavigation,
  unregisterBlockNavigation,
} from "@tau/editor/api";
import HighlightMenu from "./HighlightMenu";
import { highlightCommandIds } from "../../highlightCommands";
import CodeBlockHeader, { CODE_HOVER_GROUP, type CodeBlockStepNav } from "./CodeBlockHeader";
import ShikiOverlayEditor, { OverlayKeydownHelpers } from "./ShikiOverlayEditor";
import { codeBlockActionsMap, codeBlockMap } from "../../utils/controllerMaps";
import { getShikiHighlighter, getShikiTheme } from "../../utils/shikiHighlighter";
import {
  getActiveStepCode,
  getActiveStepHighlightLines,
  insertNextMagicMoveStep,
  normalizeMagicMove,
} from "../../utils/magicMoveOps";
import { getChangedLines } from "../../utils/lineDiff";
import { normalizeCodeBlockFilename } from "../../utils/filename";
import { deleteVoidBlock } from "@tau/editor/api";
import { hasHighlightedLineInRange } from "../../utils/highlightLineRanges";
import type { CodeBlockController } from "../../types";

import "./CodeBlock.vendor.css";
import "shiki-magic-move/style.css";

interface ICodeBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CodeBlockElement;
  onDidMount?: (controller: CodeBlockController) => void;
  onWillUnmount?: (controller: CodeBlockController) => void;
}

const INDENT = "  ";
const NODE_PERSIST_DELAY = 120;
const MIN_FOLD_HEIGHT = 200;
const MAX_FOLD_HEIGHT = 1200;
const DEFAULT_FOLD_HEIGHT = 400;
const COPIED_FEEDBACK_MS = 1500;
/** 切步后改动行先亮、再淡出，最后卸载标记 */
const CHANGED_LINES_VISIBLE_MS = 1200;
const CHANGED_LINES_CLEAR_MS = 2000;
const AUTO_CLOSE_MAP: Record<string, string> = {
  "(": ")",
  "{": "}",
  "[": "]",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CodeBlock: React.FC<React.PropsWithChildren<ICodeBlockProps>> = ({
  children,
  element,
  attributes,
  onDidMount,
  onWillUnmount,
}) => {
  const {
    code: defaultCode,
    language,
    uuid,
    magicMove: rawMagicMove,
    highlightLines,
    isFold = false,
    foldHeight = DEFAULT_FOLD_HEIGHT,
    filename,
    wrap = false,
    lineNumbers = true,
  } = element;
  const slateEditor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const message = useNotifier();
  const isLast = useIsLastElement(element);
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const [code, setCode] = useState(defaultCode || "");
  const [contentHeight, setContentHeight] = useState(0);
  const [readOnlyStepIndex, setReadOnlyStepIndex] = useState(0);
  const [magicMovePreview, setMagicMovePreview] = useState(false);
  const [previewHeightHint, setPreviewHeightHint] = useState<string | null>(null);
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);
  const [highlightContextMenu, setHighlightContextMenu] = useState<{
    selectedLines: { start: number; end: number };
  }>({
    selectedLines: { start: 0, end: 0 },
  });
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [editingFilename, setEditingFilename] = useState(false);
  const [changedLines, setChangedLines] = useState<ReadonlySet<number> | null>(null);
  const [changedLinesVisible, setChangedLinesVisible] = useState(false);
  const [lineTops, setLineTops] = useState<number[]>([]);
  const highlightAnchorRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const changedLinesTimersRef = useRef<number[]>([]);
  const pendingLocalCodeRef = useRef<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const stepSwitchRafRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const resizeStartYRef = useRef(0);
  const startFoldHeightRef = useRef(0);
  const pendingPersistRef = useRef<{
    code: string;
    step?: number;
  } | null>(null);

  const magicMove = useMemo(() => normalizeMagicMove(rawMagicMove), [rawMagicMove]);
  const hasMagicMove = Boolean(magicMove && magicMove.steps.length > 1);
  const currentStepIndex = readOnly ? readOnlyStepIndex : (magicMove?.activeStep ?? 0);
  const hasPreviousStep = hasMagicMove && currentStepIndex > 0;
  const hasNextStep = hasMagicMove && currentStepIndex < (magicMove?.steps.length ?? 1) - 1;
  const currentStepCode = magicMove?.steps[currentStepIndex]?.code;
  const currentStepHighlightLines = magicMove
    ? getActiveStepHighlightLines(magicMove)
    : highlightLines;
  const selectedStartLine = highlightContextMenu.selectedLines.start + 1;
  const selectedEndLine = highlightContextMenu.selectedLines.end + 1;
  const canRemoveSelectedHighlight = hasHighlightedLineInRange(
    currentStepHighlightLines,
    selectedStartLine,
    selectedEndLine
  );
  const shikiTheme = getShikiTheme(isDark);
  const normalizedFoldHeight = Math.min(
    MAX_FOLD_HEIGHT,
    Math.max(MIN_FOLD_HEIGHT, foldHeight || DEFAULT_FOLD_HEIGHT)
  );
  const canFold = contentHeight > Math.max(normalizedFoldHeight, MIN_FOLD_HEIGHT);
  const isFolded = isFold && canFold;
  const overlayDisplayHeight = isFolded ? normalizedFoldHeight : null;
  const hiddenLineCount = isFolded ? lineTops.filter(top => top >= normalizedFoldHeight).length : 0;

  useEffect(() => {
    let cancelled = false;
    getShikiHighlighter()
      .then(instance => {
        if (!cancelled) {
          setHighlighter(instance as unknown as HighlighterCore);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlighter(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (stepSwitchRafRef.current) {
        window.cancelAnimationFrame(stepSwitchRafRef.current);
        stepSwitchRafRef.current = null;
      }
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      pendingPersistRef.current = null;
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      changedLinesTimersRef.current.forEach(timer => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (readOnly || !isFold || canFold) {
      return;
    }
    Transforms.setNodes(
      slateEditor,
      { isFold: false },
      { at: ReactEditor.findPath(slateEditor, element) }
    );
  }, [canFold, element, isFold, readOnly, slateEditor]);

  useEffect(() => {
    if (!magicMove) {
      setReadOnlyStepIndex(0);
      setPreviewHeightHint(null);
      return;
    }
    setReadOnlyStepIndex(magicMove.activeStep);
  }, [magicMove]);

  useEffect(() => {
    if (!readOnly || !magicMove) {
      return;
    }
    setReadOnlyStepIndex(magicMove.activeStep);
  }, [readOnly, magicMove]);

  useEffect(() => {
    const nextCode = currentStepCode ?? defaultCode ?? "";
    if (pendingLocalCodeRef.current === nextCode) {
      pendingLocalCodeRef.current = null;
      return;
    }
    pendingLocalCodeRef.current = null;
    setCode(nextCode);
  }, [currentStepCode, defaultCode, uuid]);

  const setNodeCode = useMemoizedFn((nextCode: string, nextStep?: number) => {
    const path = ReactEditor.findPath(slateEditor, element);
    const payload: Partial<CodeBlockElement> = {
      code: nextCode,
    };

    if (magicMove) {
      const active = typeof nextStep === "number" ? nextStep : currentStepIndex;
      const safeStep = Math.min(Math.max(active, 0), magicMove.steps.length - 1);
      const steps = magicMove.steps.map((step, index) =>
        index === safeStep
          ? {
              ...step,
              code: nextCode,
            }
          : step
      );
      payload.magicMove = {
        ...magicMove,
        activeStep: safeStep,
        steps,
      };
    }

    Transforms.setNodes(slateEditor, payload, { at: path });
  });

  const setNodeMagicMove = useMemoizedFn(
    (nextMagicMove: CodeBlockMagicMove, fallbackCode: string) => {
      const nextCode = getActiveStepCode(nextMagicMove, fallbackCode);
      const path = ReactEditor.findPath(slateEditor, element);
      Transforms.setNodes(
        slateEditor,
        {
          code: nextCode,
          magicMove: nextMagicMove,
        },
        { at: path }
      );
      return nextCode;
    }
  );

  const executeHighlight = useMemoizedFn((command: string) => {
    const { start, end } = highlightContextMenu.selectedLines;
    slateEditor.commands?.execute(command, { start: start + 1, end: end + 1 }, element);
  });

  const flushPendingPersist = useMemoizedFn(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (readOnly || !pendingPersistRef.current) {
      return;
    }
    const pending = pendingPersistRef.current;
    pendingPersistRef.current = null;
    setNodeCode(pending.code, pending.step);
  });

  const cancelPendingPersist = useMemoizedFn(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  });

  const scheduleNodeCodePersist = useMemoizedFn((nextCode: string, nextStep?: number) => {
    if (readOnly) {
      return;
    }
    pendingPersistRef.current = {
      code: nextCode,
      step: nextStep,
    };
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      if (!pendingPersistRef.current) {
        return;
      }
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      setNodeCode(pending.code, pending.step);
    }, NODE_PERSIST_DELAY);
  });

  useEffect(() => {
    return () => {
      if (!readOnly && pendingPersistRef.current) {
        const pending = pendingPersistRef.current;
        pendingPersistRef.current = null;
        try {
          setNodeCode(pending.code, pending.step);
        } catch {
          // 组件卸载时可能已删除节点，忽略 flush 失败
        }
      }
    };
  }, [readOnly, setNodeCode]);

  const applyCodeChange = useMemoizedFn((nextCode: string) => {
    if (readOnly) {
      setCode(nextCode);
      return;
    }
    pendingLocalCodeRef.current = nextCode;
    setCode(nextCode);
    scheduleNodeCodePersist(nextCode);
  });

  const playStepPreviewAnimation = useMemoizedFn(() => {
    setMagicMovePreview(true);
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      setMagicMovePreview(false);
      previewTimerRef.current = null;
    }, 650);
  });

  const clearChangedLines = useMemoizedFn(() => {
    changedLinesTimersRef.current.forEach(timer => window.clearTimeout(timer));
    changedLinesTimersRef.current = [];
    setChangedLines(null);
    setChangedLinesVisible(false);
  });

  const flashChangedLines = useMemoizedFn((previousCode: string, nextCode: string) => {
    clearChangedLines();
    const lines = getChangedLines(previousCode, nextCode);
    if (lines.size === 0) return;
    setChangedLines(lines);
    setChangedLinesVisible(true);
    changedLinesTimersRef.current = [
      window.setTimeout(() => setChangedLinesVisible(false), CHANGED_LINES_VISIBLE_MS),
      window.setTimeout(() => setChangedLines(null), CHANGED_LINES_CLEAR_MS),
    ];
  });

  const goToStep = useMemoizedFn((step: number) => {
    if (!magicMove) return;
    flushPendingPersist();
    if (stepSwitchRafRef.current) {
      window.cancelAnimationFrame(stepSwitchRafRef.current);
      stepSwitchRafRef.current = null;
    }
    const nextStep = Math.min(Math.max(step, 0), magicMove.steps.length - 1);
    const nextCode = magicMove.steps[nextStep]?.code ?? "";
    // 只在前进时标改动行：后退看到的是「上一步的样子」，没有新增内容
    if (nextStep > currentStepIndex) flashChangedLines(code || "", nextCode);
    else clearChangedLines();
    setPreviewHeightHint(nextCode);
    playStepPreviewAnimation();
    stepSwitchRafRef.current = window.requestAnimationFrame(() => {
      stepSwitchRafRef.current = null;
      pendingLocalCodeRef.current = nextCode;
      setCode(nextCode);
      setPreviewHeightHint(null);
      if (readOnly) {
        setReadOnlyStepIndex(nextStep);
        return;
      }
      setNodeCode(nextCode, nextStep);
    });
  });

  const goToPreviousStep = useMemoizedFn(() => {
    if (!hasPreviousStep) return;
    goToStep(currentStepIndex - 1);
  });

  const goToNextStep = useMemoizedFn(() => {
    if (!hasNextStep) return;
    goToStep(currentStepIndex + 1);
  });

  const handleInsertNextStep = useMemoizedFn(() => {
    if (readOnly || !magicMove) {
      return;
    }
    flushPendingPersist();
    const nextMagicMove = insertNextMagicMoveStep(magicMove, code || "", currentStepHighlightLines);
    const nextCode = setNodeMagicMove(nextMagicMove, code || "");
    pendingLocalCodeRef.current = nextCode;
    setCode(nextCode);
    clearChangedLines();
    codeBlockMap.get(uuid)?.focus();
  });

  const handleStepTitleChange = useMemoizedFn((title: string) => {
    if (readOnly || !magicMove) return;
    const steps = magicMove.steps.map((step, index) =>
      index === currentStepIndex ? { ...step, title: title || undefined } : step
    );
    Transforms.setNodes(
      slateEditor,
      { magicMove: { ...magicMove, steps } },
      { at: ReactEditor.findPath(slateEditor, element) }
    );
  });

  const handleFilenameCommit = useMemoizedFn((value: string) => {
    setEditingFilename(false);
    if (readOnly) return;
    const nextFilename = normalizeCodeBlockFilename(value);
    if (nextFilename === filename) return;
    const path = ReactEditor.findPath(slateEditor, element);
    if (nextFilename) Transforms.setNodes(slateEditor, { filename: nextFilename }, { at: path });
    else Transforms.unsetNodes(slateEditor, "filename", { at: path });
  });

  const handleLineNumberClick = useMemoizedFn((line: number, event: React.MouseEvent) => {
    if (readOnly) return;
    const anchor = highlightAnchorRef.current;
    if (event.shiftKey && anchor !== null) {
      slateEditor.commands?.execute(
        highlightCommandIds.add,
        { start: Math.min(anchor, line), end: Math.max(anchor, line) },
        element
      );
      return;
    }
    highlightAnchorRef.current = line;
    const highlighted = hasHighlightedLineInRange(currentStepHighlightLines, line, line);
    slateEditor.commands?.execute(
      highlighted ? highlightCommandIds.remove : highlightCommandIds.add,
      { start: line, end: line },
      element
    );
  });

  const updateFoldHeight = useMemoizedFn((nextHeight: number) => {
    if (readOnly) {
      return;
    }
    const safeHeight = Math.min(MAX_FOLD_HEIGHT, Math.max(MIN_FOLD_HEIGHT, nextHeight));
    Transforms.setNodes(
      slateEditor,
      { foldHeight: safeHeight },
      { at: ReactEditor.findPath(slateEditor, element) }
    );
  });

  const handleResizeMove = useMemoizedFn((event: MouseEvent) => {
    const deltaY = event.clientY - resizeStartYRef.current;
    updateFoldHeight(startFoldHeightRef.current + deltaY);
  });

  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  const handleResizeStart = useMemoizedFn((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isFolded || readOnly) {
      return;
    }
    event.preventDefault();
    resizeStartYRef.current = event.clientY;
    startFoldHeightRef.current = normalizedFoldHeight;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  const handleToggleFold = useMemoizedFn(() => {
    if (readOnly || !canFold) {
      return;
    }
    const nextIsFold = !isFolded;
    Transforms.setNodes(
      slateEditor,
      {
        isFold: nextIsFold,
        foldHeight: normalizedFoldHeight,
      },
      { at: ReactEditor.findPath(slateEditor, element) }
    );
  });

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeEnd, handleResizeMove]);

  useEffect(() => {
    codeBlockActionsMap.set(uuid, { editFilename: () => setEditingFilename(true) });
    return () => {
      codeBlockActionsMap.delete(uuid);
    };
  }, [uuid]);

  useEffect(() => {
    const scrollIntoView = () => {
      try {
        const dom = ReactEditor.toDOMNode(slateEditor, element);
        dom.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } catch {
        // ignore
      }
    };

    const focusCodeEditor = (toEnd: boolean) => {
      const controller = codeBlockMap.get(uuid);
      if (!controller) {
        return false;
      }
      scrollIntoView();
      const targetLine = toEnd ? controller.lastLine() : 0;
      const targetLineText = controller.getLine(targetLine);
      controller.focus();
      controller.setCursor({
        line: targetLine,
        ch: toEnd ? targetLineText.length : 0,
      });
      return true;
    };

    registerBlockNavigation(element, {
      focusStart: () => focusCodeEditor(false),
      focusEnd: () => focusCodeEditor(true),
    });

    return () => {
      unregisterBlockNavigation(element);
    };
  }, [element, slateEditor, uuid]);

  const handleCopyCode = useMemoizedFn(async () => {
    const editorController = codeBlockMap.get(uuid);
    const currentCode = editorController?.getValue() ?? code;
    if (!navigator.clipboard) {
      message.error("复制代码失败");
      return;
    }
    try {
      await navigator.clipboard.writeText(currentCode);
    } catch {
      message.error("复制代码失败");
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
  });

  const handleOnLanguageChange = useMemoizedFn((value: string) => {
    if (readOnly) {
      return;
    }
    Transforms.setNodes(
      slateEditor,
      { language: value },
      { at: ReactEditor.findPath(slateEditor, element) }
    );
  });

  const replaceRange = (source: string, start: number, end: number, text: string): string => {
    return `${source.slice(0, start)}${text}${source.slice(end)}`;
  };

  const handleEditorKeyDown = useMemoizedFn(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, helpers: OverlayKeydownHelpers) => {
      const keyboardEvent = event.nativeEvent;
      const value = helpers.getValue();
      const selection = helpers.getSelection();
      const isCollapsed = selection.start === selection.end;

      const tryFocusOuterBlock = (direction: "backward" | "forward", metaReason: "arrow") => {
        const path = ReactEditor.findPath(slateEditor, element);
        const meta = {
          reason: metaReason,
          direction,
        } as const;
        return direction === "backward"
          ? focusPreviousBlock(slateEditor, path, meta)
          : focusNextBlock(slateEditor, path, meta);
      };

      if (isHotkey(["delete", "backspace"], keyboardEvent) && value === "") {
        event.preventDefault();
        if (readOnly) return;
        cancelPendingPersist();
        const path = ReactEditor.findPath(slateEditor, element);
        codeBlockMap.delete(uuid);
        deleteVoidBlock(slateEditor, path);
        return;
      }

      if (isHotkey("up", keyboardEvent) && isCollapsed) {
        const cursor = helpers.getCursor();
        if (cursor.line === 0 && cursor.ch === 0) {
          const focused = tryFocusOuterBlock("backward", "arrow");
          if (focused) {
            event.preventDefault();
            return;
          }
        }
      }

      if (isHotkey("down", keyboardEvent) && isCollapsed) {
        const cursor = helpers.getCursor();
        const lastLine = helpers.lastLine();
        const lastLineText = helpers.getLine(lastLine);
        if (cursor.line === lastLine && cursor.ch === lastLineText.length) {
          const focused = tryFocusOuterBlock("forward", "arrow");
          if (focused) {
            event.preventDefault();
            return;
          }
        }
      }

      if (
        !keyboardEvent.metaKey &&
        !keyboardEvent.ctrlKey &&
        !keyboardEvent.altKey &&
        keyboardEvent.key in AUTO_CLOSE_MAP
      ) {
        const closeChar = AUTO_CLOSE_MAP[keyboardEvent.key];
        event.preventDefault();
        const nextValue = replaceRange(
          value,
          selection.start,
          selection.end,
          `${keyboardEvent.key}${value.slice(selection.start, selection.end)}${closeChar}`
        );
        applyCodeChange(nextValue);
        const cursorOffset = isCollapsed ? selection.start + 1 : selection.end + 2;
        queueMicrotask(() => {
          helpers.setSelection(cursorOffset, cursorOffset);
        });
        return;
      }

      if (keyboardEvent.key === "Tab") {
        event.preventDefault();
        const lineStart = value.lastIndexOf("\n", selection.start - 1) + 1;
        const lineEndRaw = value.indexOf("\n", selection.end);
        const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split("\n");

        if (keyboardEvent.shiftKey) {
          const updatedLines = lines.map(line => {
            if (line.startsWith(INDENT)) {
              return line.slice(INDENT.length);
            }
            if (line.startsWith("\t")) {
              return line.slice(1);
            }
            return line;
          });
          const nextBlock = updatedLines.join("\n");
          const nextValue = replaceRange(value, lineStart, lineEnd, nextBlock);
          applyCodeChange(nextValue);
          queueMicrotask(() => {
            const shrink = block.length - nextBlock.length;
            if (isCollapsed) {
              const next = Math.max(lineStart, selection.start - Math.min(shrink, INDENT.length));
              helpers.setSelection(next, next);
            } else {
              helpers.setSelection(lineStart, lineStart + nextBlock.length);
            }
          });
        } else {
          const nextBlock = lines.map(line => `${INDENT}${line}`).join("\n");
          const nextValue = replaceRange(value, lineStart, lineEnd, nextBlock);
          applyCodeChange(nextValue);
          queueMicrotask(() => {
            if (isCollapsed) {
              const next = selection.start + INDENT.length;
              helpers.setSelection(next, next);
            } else {
              helpers.setSelection(lineStart, lineStart + nextBlock.length);
            }
          });
        }
        return;
      }

      if (
        keyboardEvent.key === "Enter" &&
        !keyboardEvent.shiftKey &&
        !keyboardEvent.ctrlKey &&
        !keyboardEvent.metaKey &&
        !keyboardEvent.altKey
      ) {
        const cursor = helpers.getCursor();
        const lastLine = helpers.lastLine();
        const currentLine = helpers.getLine(cursor.line);
        if (
          isCollapsed &&
          cursor.line === lastLine &&
          cursor.ch === currentLine.length &&
          currentLine.trim() === "" &&
          lastLine >= 2 &&
          helpers.getLine(cursor.line - 1).trim() === ""
        ) {
          event.preventDefault();
          const lines = value.split("\n");
          const nextValue = lines.slice(0, -2).join("\n");
          cancelPendingPersist();
          pendingLocalCodeRef.current = nextValue;
          setCode(nextValue);
          setNodeCode(nextValue);
          addParagraphRef.current?.addParagraph();
          return;
        }

        event.preventDefault();
        const beforeCursor = value.slice(0, selection.start);
        const lineStart = beforeCursor.lastIndexOf("\n") + 1;
        const currentLineBeforeCursor = beforeCursor.slice(lineStart);
        const indent = currentLineBeforeCursor.match(/^[\t ]*/)?.[0] || "";
        const shouldExtraIndent = /[{[(]\s*$/.test(currentLineBeforeCursor);
        const insertion = `\n${indent}${shouldExtraIndent ? INDENT : ""}`;
        const nextValue = replaceRange(value, selection.start, selection.end, insertion);
        applyCodeChange(nextValue);
        const nextCursor = selection.start + insertion.length;
        queueMicrotask(() => {
          helpers.setSelection(nextCursor, nextCursor);
        });
      }
    }
  );

  const stepNav: CodeBlockStepNav | null =
    hasMagicMove && magicMove
      ? {
          current: currentStepIndex,
          total: magicMove.steps.length,
          title: magicMove.steps[currentStepIndex]?.title,
          hasPrevious: hasPreviousStep,
          hasNext: hasNextStep,
          onPrevious: goToPreviousStep,
          onNext: goToNextStep,
          onInsertNext: readOnly ? undefined : handleInsertNextStep,
          onTitleChange: readOnly ? undefined : handleStepTitleChange,
        }
      : null;

  return (
    <div
      contentEditable={false}
      className={cn(
        "relative [--ed-code-pad-bottom:0.9em] [--ed-code-pad-left:1.25em] [--ed-code-pad-right:1em] [--ed-code-pad-top:0.9em]",
        CODE_HOVER_GROUP
      )}
    >
      <div {...attributes}>
        {children}
        <div className="overflow-hidden rounded-[0.625em] bg-[var(--ed-code-bg)] shadow-[var(--ed-code-shadow)]">
          <CodeBlockHeader
            language={language}
            onLanguageChange={handleOnLanguageChange}
            readOnly={readOnly}
            filename={filename}
            editingFilename={editingFilename}
            onEditFilename={() => setEditingFilename(true)}
            onFilenameCommit={handleFilenameCommit}
            steps={stepNav}
            copied={copied}
            onCopy={handleCopyCode}
            onOpenMenu={
              readOnly
                ? undefined
                : anchor => setMenuPosition({ x: anchor.left, y: anchor.bottom + 6 })
            }
          />
          <div
            className={cn(
              "relative",
              // 折叠时底部渐隐到代码底色
              isFolded &&
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-[4] after:h-[3em] after:bg-[linear-gradient(180deg,transparent_0%,var(--ed-code-bg)_100%)] after:content-['']"
            )}
          >
            <HighlightMenu
              readOnly={readOnly}
              canRemove={canRemoveSelectedHighlight}
              onAdd={() => executeHighlight(highlightCommandIds.add)}
              onRemove={() => executeHighlight(highlightCommandIds.remove)}
            >
              <ShikiOverlayEditor
                value={code || ""}
                language={language}
                isDark={isDark}
                readOnly={readOnly}
                className="ed-code-overlay"
                allowScroll={isFolded}
                displayHeight={overlayDisplayHeight}
                heightHintValue={magicMovePreview ? previewHeightHint : null}
                onContentHeightChange={setContentHeight}
                onChange={applyCodeChange}
                onBlur={flushPendingPersist}
                onKeyDown={readOnly ? undefined : handleEditorKeyDown}
                onDidMount={readOnly ? undefined : onDidMount}
                onWillUnmount={readOnly ? undefined : onWillUnmount}
                magicMoveEnabled={hasMagicMove}
                enableMagicMovePreview={magicMovePreview && hasMagicMove}
                magicMoveHighlighter={highlighter}
                magicMoveTheme={shikiTheme}
                highlightLines={currentStepHighlightLines}
                lineNumbers={lineNumbers}
                wrap={wrap && !hasMagicMove}
                changedLines={changedLines}
                changedLinesVisible={changedLinesVisible}
                onLineNumberClick={readOnly ? undefined : handleLineNumberClick}
                onLineTopsChange={canFold ? setLineTops : undefined}
                onContextMenu={
                  readOnly
                    ? undefined
                    : (e, sel) => {
                        e.preventDefault();
                        setHighlightContextMenu({
                          selectedLines: sel,
                        });
                      }
                }
              />
            </HighlightMenu>
          </div>
          {canFold && !readOnly && (
            <div
              role="button"
              tabIndex={-1}
              className="relative flex h-[2.25em] cursor-pointer select-none items-center justify-center gap-[0.375em] border-t border-dashed border-[var(--ed-border)] text-[0.75em] text-[var(--ed-text-secondary)] transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]"
              onClick={handleToggleFold}
            >
              {isFolded && (
                <span
                  className={cn(
                    "absolute left-1/2 top-[-0.25em] h-[0.5em] w-[3.5em] -translate-x-1/2 cursor-ns-resize rounded-full",
                    "after:absolute after:inset-x-0 after:top-[0.125em] after:h-[0.25em] after:rounded-full after:bg-[var(--ed-border)] after:opacity-0 after:transition-opacity after:content-[''] group-hover/code:after:opacity-100"
                  )}
                  onMouseDown={handleResizeStart}
                  onClick={event => event.stopPropagation()}
                />
              )}
              <ChevronDown
                size="1.2em"
                strokeWidth={2}
                className={cn("transition-transform duration-200", !isFolded && "rotate-180")}
              />
              {isFolded
                ? hiddenLineCount > 0
                  ? `展开剩余 ${hiddenLineCount} 行`
                  : "展开"
                : "收起"}
            </div>
          )}
        </div>
        {!(readOnly && isLast) && <AddParagraph element={element} ref={addParagraphRef} />}
      </div>
      {menuPosition && (
        <ElementMenu
          element={element}
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
        />
      )}
    </div>
  );
};

CodeBlock.displayName = "CodeBlock";

export default React.memo(CodeBlock);
