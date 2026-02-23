import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import classnames from "classnames";
import { ShikiMagicMove } from "shiki-magic-move/react";
import type { HighlighterCore } from "shiki/core";

import type { CodeBlockController, CodeCursorPosition } from "../../types";
import {
  renderCodeWithShiki,
  resolveShikiLanguage,
} from "../../utils/shikiHighlighter";
import { parseHighlightLinesToSet } from "../../utils/highlightLineRanges";

interface SelectionRange {
  start: number;
  end: number;
}

export interface OverlayKeydownHelpers {
  getValue: () => string;
  setValue: (value: string) => void;
  getCursor: () => CodeCursorPosition;
  setCursor: (cursor: CodeCursorPosition) => void;
  getSelection: () => SelectionRange;
  setSelection: (start: number, end: number) => void;
  getLine: (line: number) => string;
  lastLine: () => number;
}

interface ShikiOverlayEditorProps {
  value: string;
  language: string;
  isDark: boolean;
  readOnly?: boolean;
  className?: string;
  allowScroll?: boolean;
  displayHeight?: number | null;
  heightHintValue?: string | null;
  onContentHeightChange?: (height: number) => void;
  magicMoveEnabled?: boolean;
  magicMoveHighlighter?: HighlighterCore | null;
  magicMoveTheme?: string;
  enableMagicMovePreview?: boolean;
  highlightLines?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onDidMount?: (controller: CodeBlockController) => void;
  onWillUnmount?: (controller: CodeBlockController) => void;
  onKeyDown?: (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    helpers: OverlayKeydownHelpers,
  ) => void;
  onContextMenu?: (
    e: React.MouseEvent,
    selectedLines: { start: number; end: number },
  ) => void;
}

const MIN_HEIGHT = 0;

const getLines = (value: string): string[] => {
  return value.split("\n");
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const offsetToCursor = (value: string, offset: number): CodeCursorPosition => {
  const target = clamp(offset, 0, value.length);
  let line = 0;
  let ch = 0;
  for (let i = 0; i < target; i += 1) {
    if (value[i] === "\n") {
      line += 1;
      ch = 0;
    } else {
      ch += 1;
    }
  }
  return { line, ch };
};

const cursorToOffset = (value: string, cursor: CodeCursorPosition): number => {
  const lines = getLines(value);
  const maxLine = Math.max(lines.length - 1, 0);
  const targetLine = clamp(cursor.line, 0, maxLine);
  let offset = 0;
  for (let i = 0; i < targetLine; i += 1) {
    offset += (lines[i] || "").length + 1;
  }
  const targetLineText = lines[targetLine] || "";
  return offset + clamp(cursor.ch, 0, targetLineText.length);
};

const ShikiOverlayEditor: React.FC<ShikiOverlayEditorProps> = ({
  value,
  language,
  isDark,
  readOnly = false,
  className,
  allowScroll = false,
  displayHeight = null,
  heightHintValue = null,
  onContentHeightChange,
  magicMoveEnabled = false,
  magicMoveHighlighter,
  magicMoveTheme,
  enableMagicMovePreview = false,
  highlightLines,
  onChange,
  onBlur,
  onDidMount,
  onWillUnmount,
  onKeyDown,
  onContextMenu,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeLayerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLPreElement | null>(null);
  const valueRef = useRef(value);
  const [codeHtml, setCodeHtml] = useState("");
  const [editorHeight, setEditorHeight] = useState(0);
  const renderTaskIdRef = useRef(0);
  const measuredContentHeightRef = useRef(0);

  valueRef.current = value;
  const shikiLanguage = useMemo(
    () => resolveShikiLanguage(language),
    [language],
  );
  const shikiTheme = magicMoveTheme || "github-light";
  const magicMoveKey = useMemo(
    () => `${shikiTheme}:${shikiLanguage}`,
    [shikiTheme, shikiLanguage],
  );
  const measuredValue = useMemo(() => {
    if (!heightHintValue) {
      return value;
    }
    return getLines(heightHintValue).length > getLines(value).length
      ? heightHintValue
      : value;
  }, [heightHintValue, value]);
  const measureContent = useMemo(() => {
    if (measuredValue.length === 0) {
      return "\u200b";
    }
    return measuredValue.endsWith("\n")
      ? `${measuredValue}\u200b`
      : measuredValue;
  }, [measuredValue]);

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current;
    let measuredHeight = 0;
    if (textarea) {
      // 通过临时收缩 textarea 高度读取真实内容高度，避免受当前容器高度反向影响。
      const previousInlineHeight = textarea.style.height;
      textarea.style.height = "0px";
      measuredHeight = textarea.scrollHeight;
      textarea.style.height = previousInlineHeight;
    }
    const hintHeight =
      heightHintValue && measureRef.current
        ? measureRef.current.getBoundingClientRect().height
        : 0;
    const intrinsicHeight = Math.max(measuredHeight, hintHeight);
    const nextHeight = Math.max(MIN_HEIGHT, Math.ceil(intrinsicHeight));
    if (nextHeight !== measuredContentHeightRef.current) {
      measuredContentHeightRef.current = nextHeight;
      onContentHeightChange?.(nextHeight);
    }
    setEditorHeight((previousHeight) => {
      const targetHeight = enableMagicMovePreview
        ? Math.max(previousHeight, nextHeight)
        : nextHeight;
      return targetHeight === previousHeight ? previousHeight : targetHeight;
    });
  }, [enableMagicMovePreview, heightHintValue, onContentHeightChange]);

  useEffect(() => {
    if (measuredContentHeightRef.current > 0) {
      onContentHeightChange?.(measuredContentHeightRef.current);
    }
  }, [onContentHeightChange]);

  useLayoutEffect(() => {
    syncHeight();
  }, [measureContent, isDark, syncHeight]);

  useEffect(() => {
    if (magicMoveEnabled && magicMoveHighlighter) {
      return;
    }

    const taskId = renderTaskIdRef.current + 1;
    renderTaskIdRef.current = taskId;

    let cancelled = false;
    const render = async () => {
      const html = await renderCodeWithShiki(
        value,
        language,
        isDark,
        highlightLines,
      );
      if (!cancelled && renderTaskIdRef.current === taskId) {
        setCodeHtml(html);
      }
    };
    void render();

    return () => {
      cancelled = true;
    };
  }, [
    value,
    language,
    isDark,
    highlightLines,
    magicMoveEnabled,
    magicMoveHighlighter,
  ]);

  const applyMagicMoveLineHighlight = useCallback(() => {
    if (!magicMoveEnabled || !magicMoveHighlighter) {
      return;
    }
    const layer = codeLayerRef.current;
    if (!layer) return;

    const container = layer.querySelector(
      ".code-block-shiki-magic",
    ) as HTMLElement | null;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    const contentChildren =
      children[0]?.style.position === "absolute" ? children.slice(1) : children;
    const tokens = contentChildren.filter(
      (node) => !node.className.includes("shiki-magic-move-leave"),
    );

    const lines: HTMLElement[][] = [[]];
    tokens.forEach((node) => {
      if (node.tagName === "BR") {
        lines.push([]);
        return;
      }
      lines[lines.length - 1].push(node);
    });
    const totalLines = Math.max(lines.length, 1);
    const highlighted = parseHighlightLinesToSet(highlightLines, totalLines);
    const hasHighlights = highlighted.size > 0;

    lines.forEach((lineTokens, index) => {
      const isHighlighted = highlighted.has(index + 1);
      lineTokens.forEach((token) => {
        token.classList.toggle("highlighted", hasHighlights && isHighlighted);
        token.classList.toggle("dishonored", hasHighlights && !isHighlighted);
      });
    });
  }, [highlightLines, magicMoveEnabled, magicMoveHighlighter]);

  useEffect(() => {
    if (!magicMoveEnabled || !magicMoveHighlighter || !codeLayerRef.current) {
      return;
    }

    let rafId = 0;
    const scheduleApply = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyMagicMoveLineHighlight();
      });
    };

    scheduleApply();
    const observer = new MutationObserver(() => {
      scheduleApply();
    });
    observer.observe(codeLayerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [applyMagicMoveLineHighlight, magicMoveEnabled, magicMoveHighlighter]);

  const controller = useMemo<CodeBlockController>(() => {
    return {
      focus: () => {
        textareaRef.current?.focus();
      },
      getValue: () => {
        return valueRef.current;
      },
      setValue: (nextValue: string) => {
        onChange(nextValue);
      },
      getCursor: () => {
        const textarea = textareaRef.current;
        if (!textarea) return { line: 0, ch: 0 };
        return offsetToCursor(valueRef.current, textarea.selectionStart || 0);
      },
      setCursor: (cursor: CodeCursorPosition) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const offset = cursorToOffset(valueRef.current, cursor);
        textarea.focus();
        textarea.setSelectionRange(offset, offset);
      },
      getLine: (line: number) => {
        const lines = getLines(valueRef.current);
        return lines[line] || "";
      },
      lastLine: () => {
        const lines = getLines(valueRef.current);
        return Math.max(lines.length - 1, 0);
      },
    };
  }, [onChange]);

  useEffect(() => {
    onDidMount?.(controller);
    return () => {
      onWillUnmount?.(controller);
    };
  }, [controller, onDidMount, onWillUnmount]);

  const helpers: OverlayKeydownHelpers = useMemo(() => {
    return {
      getValue: () => valueRef.current,
      setValue: (nextValue: string) => {
        controller.setValue(nextValue);
      },
      getCursor: () => controller.getCursor(),
      setCursor: (cursor: CodeCursorPosition) => {
        controller.setCursor(cursor);
      },
      getSelection: () => {
        const textarea = textareaRef.current;
        if (!textarea) return { start: 0, end: 0 };
        return {
          start: textarea.selectionStart || 0,
          end: textarea.selectionEnd || 0,
        };
      },
      setSelection: (start: number, end: number) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.setSelectionRange(start, end);
      },
      getLine: (line: number) => controller.getLine(line),
      lastLine: () => controller.lastLine(),
    };
  }, [controller]);

  return (
    <div
      className={classnames(className)}
      style={{
        height: `${displayHeight ?? editorHeight}px`,
      }}
    >
      <pre
        ref={measureRef}
        className="code-block-shiki-measure"
        aria-hidden={true}
      >
        {measureContent}
      </pre>
      <div
        ref={codeLayerRef}
        className={classnames("code-block-shiki-layer", {
          "code-block-shiki-layer-readonly": readOnly,
        })}
        style={{
          overflowX: "auto",
          overflowY: allowScroll ? "auto" : "hidden",
        }}
        onScroll={(event) => {
          if (!readOnly || !textareaRef.current) {
            return;
          }
          const target = event.currentTarget;
          textareaRef.current.scrollTop = target.scrollTop;
          textareaRef.current.scrollLeft = target.scrollLeft;
        }}
        aria-hidden={true}
      >
        {magicMoveEnabled && magicMoveHighlighter ? (
          <ShikiMagicMove
            key={magicMoveKey}
            highlighter={magicMoveHighlighter}
            lang={shikiLanguage}
            theme={shikiTheme}
            code={value}
            className="code-block-shiki-magic"
            options={{
              duration: enableMagicMovePreview ? 550 : 0,
              lineNumbers: false,
            }}
          />
        ) : (
          <div
            className="code-block-shiki-html"
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        className="code-block-shiki-input"
        spellCheck={false}
        wrap="off"
        readOnly={readOnly}
        style={{
          background: "transparent",
          WebkitTextFillColor: "transparent",
          overflowX: "auto",
          overflowY: allowScroll ? "auto" : "hidden",
        }}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          const textarea = textareaRef.current;
          if (!textarea) return;
          const start = offsetToCursor(
            value,
            textarea.selectionStart || 0,
          ).line;
          const end = offsetToCursor(value, textarea.selectionEnd || 0).line;
          onContextMenu(e, { start, end });
        }}
        onScroll={(event) => {
          const target = event.currentTarget;
          if (codeLayerRef.current) {
            codeLayerRef.current.scrollTop = target.scrollTop;
            codeLayerRef.current.scrollLeft = target.scrollLeft;
          }
        }}
        onKeyDown={(event) => onKeyDown?.(event, helpers)}
        data-shiki-language={shikiLanguage}
      />
    </div>
  );
};

export default ShikiOverlayEditor;
