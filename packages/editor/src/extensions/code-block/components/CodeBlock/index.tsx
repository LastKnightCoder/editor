import React, { useEffect, useMemo, useRef, useState } from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { useNotifier } from "../../../../services/hooks";
import isHotkey from "is-hotkey";
import { cn } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import type { HighlighterCore } from "shiki/core";
import { PortalToBody } from "@tau/shared";
import { MdFullscreenExit, MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";

import type { CodeBlockElement, CodeBlockMagicMove } from "../../../../types";
import AddParagraph, { AddParagraphRef } from "../../../../components/AddParagraph";
import useTheme from "../../../../hooks/useTheme";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import {
  focusNextBlock,
  focusPreviousBlock,
  registerBlockNavigation,
  unregisterBlockNavigation,
} from "../../../../utils";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { ContextMenuItem } from "../../../../components/EditorContextMenu/types";
import SelectLanguage from "../SelectLanguage";
import ToolbarButtons, { CODE_HOVER_GROUP } from "./ToolbarButtons";
import DragHandle from "./DragHandle";
import ShikiOverlayEditor, { OverlayKeydownHelpers } from "./ShikiOverlayEditor";
import { buildCodeBlockMenuItems } from "../../utils/menuItems";
import { codeBlockActionsMap, codeBlockMap } from "../../index";
import { getShikiHighlighter, getShikiTheme } from "../../utils/shikiHighlighter";
import {
  createInitialMagicMove,
  getActiveStepCode,
  getActiveStepHighlightLines,
  insertNextMagicMoveStep,
  normalizeMagicMove,
  removeMagicMoveStep,
} from "../../utils/magicMoveOps";
import { deleteCodeBlock } from "../../utils/deleteCodeBlock";
import {
  hasHighlightedLineInRange,
  mergeHighlightRange,
  removeHighlightRange,
} from "../../utils/highlightLineRanges";
import type { CodeBlockController } from "../../types";

import "./CodeBlock.vendor.css";
import {
  BLOCK_DRAG_GROUP,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";
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
  } = element;
  const slateEditor = useSlateStatic();
  const readOnly = useReadOnly();
  const { isDark } = useTheme();
  const message = useNotifier();
  const isLast = useIsLastElement(element);
  const addParagraphRef = useRef<AddParagraphRef>(null);
  const [code, setCode] = useState(defaultCode || "");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [readOnlyStepIndex, setReadOnlyStepIndex] = useState(0);
  const [magicMovePreview, setMagicMovePreview] = useState(false);
  const [previewHeightHint, setPreviewHeightHint] = useState<string | null>(null);
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);
  const [highlightContextMenu, setHighlightContextMenu] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    selectedLines: { start: number; end: number };
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    selectedLines: { start: 0, end: 0 },
  });
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
  const canDeleteCurrentStep = Boolean(magicMove && magicMove.steps.length > 1);
  const shikiTheme = getShikiTheme(isDark);
  const normalizedFoldHeight = Math.min(
    MAX_FOLD_HEIGHT,
    Math.max(MIN_FOLD_HEIGHT, foldHeight || DEFAULT_FOLD_HEIGHT)
  );
  const canFold = contentHeight > Math.max(normalizedFoldHeight, MIN_FOLD_HEIGHT);
  const isFolded = isFold && canFold;
  const overlayDisplayHeight = isFolded ? normalizedFoldHeight : null;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor: slateEditor,
    buildMenuItems: params => buildCodeBlockMenuItems(params, message),
  });

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

  const disableNodeMagicMove = useMemoizedFn((nextCode: string, nextHighlightLines?: string) => {
    const path = ReactEditor.findPath(slateEditor, element);
    Transforms.setNodes(
      slateEditor,
      {
        code: nextCode,
        highlightLines: nextHighlightLines,
      },
      { at: path }
    );
    if (!nextHighlightLines) {
      Transforms.unsetNodes(slateEditor, "highlightLines", { at: path });
    }
    Transforms.unsetNodes(slateEditor, "magicMove", { at: path });
    return nextCode;
  });

  const setNodeHighlightLines = useMemoizedFn((value: string) => {
    const path = ReactEditor.findPath(slateEditor, element);
    if (magicMove) {
      const safeStep = Math.min(Math.max(currentStepIndex, 0), magicMove.steps.length - 1);
      const steps = magicMove.steps.map((step, index) =>
        index === safeStep
          ? {
              ...step,
              highlightLines: value || undefined,
            }
          : step
      );
      Transforms.setNodes(
        slateEditor,
        {
          magicMove: {
            ...magicMove,
            activeStep: safeStep,
            steps,
          },
        },
        { at: path }
      );
      return;
    }
    if (value) {
      Transforms.setNodes(slateEditor, { highlightLines: value }, { at: path });
    } else {
      Transforms.unsetNodes(slateEditor, "highlightLines", { at: path });
    }
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

  const goToStep = useMemoizedFn((step: number) => {
    if (!magicMove) return;
    flushPendingPersist();
    if (stepSwitchRafRef.current) {
      window.cancelAnimationFrame(stepSwitchRafRef.current);
      stepSwitchRafRef.current = null;
    }
    const nextStep = Math.min(Math.max(step, 0), magicMove.steps.length - 1);
    const nextCode = magicMove.steps[nextStep]?.code ?? "";
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

  const handleDiffPrimaryAction = useMemoizedFn(() => {
    if (readOnly) {
      return;
    }
    flushPendingPersist();

    if (!magicMove) {
      const sourceCode = code || defaultCode || "";
      const nextMagicMove = createInitialMagicMove(sourceCode, currentStepHighlightLines);
      const nextCode = setNodeMagicMove(nextMagicMove, sourceCode);
      pendingLocalCodeRef.current = nextCode;
      setCode(nextCode);
      setPreviewHeightHint(nextCode);
      playStepPreviewAnimation();
      window.requestAnimationFrame(() => {
        setPreviewHeightHint(null);
      });
      message.success("已开启 Diff 动画");
      return;
    }

    const nextMagicMove = insertNextMagicMoveStep(magicMove, code || "", currentStepHighlightLines);
    const nextCode = setNodeMagicMove(nextMagicMove, code || "");
    pendingLocalCodeRef.current = nextCode;
    setCode(nextCode);
    setPreviewHeightHint(nextCode);
    playStepPreviewAnimation();
    window.requestAnimationFrame(() => {
      setPreviewHeightHint(null);
    });
    message.success("已新增下一步");
  });

  const handleDeleteCurrentStep = useMemoizedFn(() => {
    if (readOnly || !magicMove) {
      return;
    }
    flushPendingPersist();
    const result = removeMagicMoveStep(
      magicMove,
      code || defaultCode || "",
      currentStepHighlightLines,
      currentStepIndex
    );
    if (!result.removed) {
      return;
    }

    const nextCode = result.magicMove
      ? setNodeMagicMove(result.magicMove, result.code)
      : disableNodeMagicMove(result.code, result.highlightLines);
    pendingLocalCodeRef.current = nextCode;
    setCode(nextCode);
    setPreviewHeightHint(nextCode);
    playStepPreviewAnimation();
    window.requestAnimationFrame(() => {
      setPreviewHeightHint(null);
    });
    if (result.magicMove) {
      message.success("已删除当前步骤");
    } else {
      message.success("步骤已删除，Diff 动画已关闭");
    }
  });

  const toggleFullscreen = useMemoizedFn(() => {
    if (readOnly) {
      return;
    }
    flushPendingPersist();
    setIsFullscreen(prev => !prev);
  });

  const closeFullscreen = useMemoizedFn(() => {
    if (!isFullscreen) {
      return;
    }
    flushPendingPersist();
    setIsFullscreen(false);
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
    codeBlockActionsMap.set(uuid, {
      goToPreviousStep,
      goToNextStep,
      hasPreviousStep,
      hasNextStep,
    });
    return () => {
      codeBlockActionsMap.delete(uuid);
    };
  }, [uuid, goToPreviousStep, goToNextStep, hasPreviousStep, hasNextStep]);

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
    await navigator.clipboard.writeText(currentCode);
    message.success("复制代码成功");
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
        deleteCodeBlock(slateEditor, path);
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

  return (
    <div
      contentEditable={false}
      className={cn(
        "relative [--ed-code-pad-bottom:1.1em] [--ed-code-pad-left:1.5em] [--ed-code-pad-right:0.85em] [--ed-code-pad-top:3em]",
        CODE_HOVER_GROUP,
        BLOCK_DRAG_GROUP,
        dimWhileDragging(isDragging || (isOverCurrent && canDrop))
      )}
      ref={node => {
        drop(node);
      }}
    >
      <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />
      <div {...attributes}>
        {children}
        <ToolbarButtons
          onCopy={handleCopyCode}
          onDiffPrimaryAction={readOnly ? undefined : handleDiffPrimaryAction}
          onDeleteCurrentStep={readOnly ? undefined : handleDeleteCurrentStep}
          canDeleteCurrentStep={canDeleteCurrentStep}
          diffEnabled={Boolean(magicMove)}
          onFullscreen={readOnly ? undefined : toggleFullscreen}
          showFullscreen={!readOnly}
          isFullscreen={isFullscreen}
          onPreviousStep={goToPreviousStep}
          onNextStep={goToNextStep}
          hasPreviousStep={hasPreviousStep}
          hasNextStep={hasNextStep}
          showStepNavigation={hasMagicMove}
          currentStep={hasMagicMove ? currentStepIndex + 1 : 0}
          totalSteps={magicMove?.steps.length ?? 0}
        />
        <SelectLanguage
          readonly={readOnly}
          className="absolute left-[1em] top-[0.625em] z-[4]"
          value={language}
          onChange={handleOnLanguageChange}
        />
        <div
          className={cn(
            "group/viewport relative overflow-hidden rounded-[0.5em] bg-[var(--ed-code-bg)] shadow-[var(--ed-code-shadow)]",
            // 折叠时底部渐隐到代码底色
            isFolded &&
              "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[3em] after:bg-[linear-gradient(180deg,transparent_0%,var(--ed-code-bg)_100%)] after:content-['']"
          )}
        >
          <ShikiOverlayEditor
            value={code || ""}
            language={language}
            isDark={isDark}
            readOnly={readOnly || (canDrop && isOverCurrent) || isFullscreen}
            className="ed-code-overlay"
            allowScroll={isFolded}
            displayHeight={overlayDisplayHeight}
            heightHintValue={magicMovePreview ? previewHeightHint : null}
            onContentHeightChange={setContentHeight}
            onChange={applyCodeChange}
            onBlur={flushPendingPersist}
            onKeyDown={readOnly ? undefined : handleEditorKeyDown}
            onDidMount={readOnly || isFullscreen ? undefined : onDidMount}
            onWillUnmount={readOnly || isFullscreen ? undefined : onWillUnmount}
            magicMoveEnabled={hasMagicMove}
            enableMagicMovePreview={magicMovePreview && hasMagicMove}
            magicMoveHighlighter={highlighter}
            magicMoveTheme={shikiTheme}
            highlightLines={currentStepHighlightLines}
            onContextMenu={
              readOnly
                ? undefined
                : (e, sel) => {
                    e.preventDefault();
                    setHighlightContextMenu({
                      visible: true,
                      position: { x: e.clientX, y: e.clientY },
                      selectedLines: sel,
                    });
                  }
            }
          />
          {canFold && (
            <div
              className="pointer-events-none absolute bottom-[0.75em] right-[0.75em] z-[4] flex cursor-pointer items-center justify-center text-[var(--ed-text-tertiary)] opacity-0 transition-colors duration-200 ease-[ease] hover:text-[var(--ed-text)] group-hover/viewport:pointer-events-auto group-hover/viewport:opacity-100"
              onClick={handleToggleFold}
            >
              {isFolded ? <MdKeyboardArrowDown size={18} /> : <MdKeyboardArrowUp size={18} />}
            </div>
          )}
          {isFolded && !readOnly && (
            <div
              className="pointer-events-none absolute bottom-0 left-1/2 flex h-[1.1em] w-[2.75em] -translate-x-1/2 cursor-ns-resize items-end justify-center opacity-0 transition-opacity duration-200 ease-[ease] group-hover/viewport:pointer-events-auto group-hover/viewport:opacity-100"
              onMouseDown={handleResizeStart}
            >
              <div className="h-[0.25em] w-[2.5em] rounded-[0.125em] bg-[var(--ed-border)] group-hover/viewport:bg-[var(--ed-text-tertiary)]" />
            </div>
          )}
        </div>
        {!(readOnly && isLast) && <AddParagraph element={element} ref={addParagraphRef} />}
        <DragHandle canDrag={canDrag} dragRef={drag} onClick={dragHandlerProps.onClick} />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        <EditorContextMenu
          visible={highlightContextMenu.visible}
          position={highlightContextMenu.position}
          onClose={() => setHighlightContextMenu(prev => ({ ...prev, visible: false }))}
          items={[
            {
              key: "highlight-lines",
              label: "高亮选中行",
              onSelect: () => {
                const { start, end } = highlightContextMenu.selectedLines;
                const merged = mergeHighlightRange(currentStepHighlightLines, start + 1, end + 1);
                setNodeHighlightLines(merged);
              },
            } as ContextMenuItem,
            {
              key: "remove-highlight",
              label: "取消高亮选中行",
              disabled: !canRemoveSelectedHighlight,
              onSelect: () => {
                const { start, end } = highlightContextMenu.selectedLines;
                const removed = removeHighlightRange(currentStepHighlightLines, start + 1, end + 1);
                setNodeHighlightLines(removed);
              },
            } as ContextMenuItem,
          ]}
        />
        {isFullscreen && (
          <PortalToBody>
            <div
              className="fixed inset-0 z-[1001] flex items-center justify-center bg-[var(--ed-glass-bg)] backdrop-blur-[var(--ed-glass-blur)] [--ed-code-pad-bottom:1.2em] [--ed-code-pad-left:1.5em] [--ed-code-pad-right:0.85em] [--ed-code-pad-top:1.2em]"
              onClick={closeFullscreen}
            >
              <div
                className="relative box-border flex h-[90%] w-[90%] flex-col overflow-hidden rounded-[0.5em] bg-[var(--ed-glass-bg)] shadow-[var(--ed-shadow-float)] backdrop-blur-[var(--ed-glass-blur)]"
                onClick={event => event.stopPropagation()}
              >
                <div className="relative z-[2] flex h-[2.5em] items-center justify-between border-b border-solid border-[var(--ed-border)] px-[1.25em] py-[0.625em]">
                  <SelectLanguage
                    readonly={readOnly}
                    className="static"
                    value={language}
                    onChange={handleOnLanguageChange}
                  />
                  <div
                    className="flex h-[1.75em] w-[1.75em] cursor-pointer items-center justify-center rounded-[0.25em] p-[0.25em] transition-all duration-200"
                    onClick={closeFullscreen}
                  >
                    <MdFullscreenExit size={20} />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-[1.25em]">
                  <ShikiOverlayEditor
                    value={code || ""}
                    language={language}
                    isDark={isDark}
                    readOnly={readOnly}
                    className="ed-code-overlay rounded-[0.5em] bg-[var(--ed-code-bg)] shadow-[var(--ed-code-shadow)]"
                    allowScroll={true}
                    onChange={applyCodeChange}
                    onBlur={flushPendingPersist}
                    onKeyDown={readOnly ? undefined : handleEditorKeyDown}
                    onContentHeightChange={setContentHeight}
                    magicMoveEnabled={hasMagicMove}
                    enableMagicMovePreview={magicMovePreview && hasMagicMove}
                    magicMoveHighlighter={highlighter}
                    magicMoveTheme={shikiTheme}
                    highlightLines={currentStepHighlightLines}
                    onContextMenu={
                      readOnly
                        ? undefined
                        : (e, sel) => {
                            e.preventDefault();
                            setHighlightContextMenu({
                              visible: true,
                              position: { x: e.clientX, y: e.clientY },
                              selectedLines: sel,
                            });
                          }
                    }
                  />
                </div>
              </div>
            </div>
          </PortalToBody>
        )}
      </div>
    </div>
  );
};

CodeBlock.displayName = "CodeBlock";

export default React.memo(CodeBlock);
