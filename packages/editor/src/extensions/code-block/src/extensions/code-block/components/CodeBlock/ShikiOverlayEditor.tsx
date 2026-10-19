import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import classnames from "classnames";
import { ShikiMagicMove } from "shiki-magic-move/react";
import type { HighlighterCore } from "shiki/core";

import type { CodeBlockController, CodeCursorPosition } from "../../types";
import { renderCodeWithShiki, resolveShikiLanguage } from "../../utils/shikiHighlighter";
import { parseHighlightLinesToSet } from "../../utils/highlightLineRanges";

interface SelectionRange {
  start: number;
  end: number;
}

interface SelectionSnapshot extends SelectionRange {
  direction: HTMLTextAreaElement["selectionDirection"];
  value: string;
  allowValueChange?: boolean;
  pendingRestore?: boolean;
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
  /** 左侧行号栏 */
  lineNumbers?: boolean;
  /** 自动换行；调用方保证不与 magic-move 同时开启（token 为 inline-block，折行对不齐） */
  wrap?: boolean;
  /** 需要短暂标出的行（0 起），配合 changedLinesVisible 淡入淡出 */
  changedLines?: ReadonlySet<number> | null;
  changedLinesVisible?: boolean;
  /** 点击行号（1 起） */
  onLineNumberClick?: (line: number, event: React.MouseEvent) => void;
  /** 每个逻辑行的顶部偏移（含上内边距），折行时一行可能占多个视觉行 */
  onLineTopsChange?: (tops: number[]) => void;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onDidMount?: (controller: CodeBlockController) => void;
  onWillUnmount?: (controller: CodeBlockController) => void;
  onKeyDown?: (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    helpers: OverlayKeydownHelpers
  ) => void;
  onContextMenu?: (e: React.MouseEvent, selectedLines: { start: number; end: number }) => void;
}

const MIN_HEIGHT = 0;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

const getLines = (value: string): string[] => {
  return value.split("\n");
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const getWheelDeltaPixels = (event: React.WheelEvent<HTMLElement>): number => {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * event.currentTarget.clientWidth;
  }
  return event.deltaY;
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

interface LineBox {
  top: number;
  height: number;
}

const isSameLayout = (a: LineBox[], b: LineBox[]) =>
  a.length === b.length && a.every((box, i) => box.top === b[i].top && box.height === b[i].height);

const clampSelectionSnapshot = (snapshot: SelectionSnapshot, value: string): SelectionSnapshot => {
  return {
    ...snapshot,
    start: clamp(snapshot.start, 0, value.length),
    end: clamp(snapshot.end, 0, value.length),
    value,
  };
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
  lineNumbers = false,
  wrap = false,
  changedLines = null,
  changedLinesVisible = false,
  onLineNumberClick,
  onLineTopsChange,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const linesMeasureRef = useRef<HTMLDivElement | null>(null);
  const gutterInnerRef = useRef<HTMLDivElement | null>(null);
  const decoInnerRef = useRef<HTMLDivElement | null>(null);
  const [lineLayout, setLineLayout] = useState<LineBox[]>([]);
  const valueRef = useRef(value);
  const [codeHtml, setCodeHtml] = useState("");
  const [editorHeight, setEditorHeight] = useState(0);
  const renderTaskIdRef = useRef(0);
  const measuredContentHeightRef = useRef(0);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);

  valueRef.current = value;
  const lines = useMemo(() => getLines(value), [value]);
  const hasChangedLines = Boolean(changedLines && changedLines.size > 0);
  const needsLineLayout = lineNumbers || hasChangedLines || Boolean(onLineTopsChange);
  const highlightedLineSet = useMemo(
    () => parseHighlightLinesToSet(highlightLines, lines.length),
    [highlightLines, lines.length]
  );
  const shikiLanguage = useMemo(() => resolveShikiLanguage(language), [language]);
  const shikiTheme = magicMoveTheme || "github-light";
  const magicMoveKey = useMemo(() => `${shikiTheme}:${shikiLanguage}`, [shikiTheme, shikiLanguage]);
  const measuredValue = useMemo(() => {
    if (!heightHintValue) {
      return value;
    }
    return getLines(heightHintValue).length > getLines(value).length ? heightHintValue : value;
  }, [heightHintValue, value]);
  const measureContent = useMemo(() => {
    if (measuredValue.length === 0) {
      return "\u200b";
    }
    return measuredValue.endsWith("\n") ? `${measuredValue}\u200b` : measuredValue;
  }, [measuredValue]);

  const saveSelectionSnapshot = useCallback(
    (
      textarea: HTMLTextAreaElement | null = textareaRef.current,
      options: { allowValueChange?: boolean } = {}
    ) => {
      if (!textarea) {
        return;
      }
      selectionSnapshotRef.current = {
        start: textarea.selectionStart || 0,
        end: textarea.selectionEnd || 0,
        direction: textarea.selectionDirection,
        value: textarea.value,
        allowValueChange: options.allowValueChange,
        pendingRestore: options.allowValueChange,
      };
    },
    []
  );

  const measureLineLayout = useCallback(() => {
    const box = linesMeasureRef.current;
    if (!box) return;
    const next = Array.from(box.children, child => {
      const element = child as HTMLElement;
      return { top: element.offsetTop, height: element.offsetHeight };
    });
    setLineLayout(previous => (isSameLayout(previous, next) ? previous : next));
  }, []);

  useLayoutEffect(() => {
    if (needsLineLayout) measureLineLayout();
  }, [needsLineLayout, measureLineLayout, value, wrap, lineNumbers, isDark]);

  useEffect(() => {
    // 换行时宽度变化会改变折行，需要重新测量
    const root = rootRef.current;
    if (!needsLineLayout || !wrap || !root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureLineLayout());
    observer.observe(root);
    return () => observer.disconnect();
  }, [needsLineLayout, wrap, measureLineLayout]);

  useEffect(() => {
    onLineTopsChange?.(lineLayout.map(box => box.top));
  }, [lineLayout, onLineTopsChange]);

  const syncDecorationScroll = useCallback((scrollTop: number) => {
    const transform = scrollTop ? `translateY(${-scrollTop}px)` : "";
    if (gutterInnerRef.current) gutterInnerRef.current.style.transform = transform;
    if (decoInnerRef.current) decoInnerRef.current.style.transform = transform;
  }, []);

  useLayoutEffect(() => {
    syncDecorationScroll(textareaRef.current?.scrollTop ?? 0);
  });

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
      heightHintValue && measureRef.current ? measureRef.current.getBoundingClientRect().height : 0;
    const intrinsicHeight = Math.max(measuredHeight, hintHeight);
    const nextHeight = Math.max(MIN_HEIGHT, Math.ceil(intrinsicHeight));
    if (nextHeight !== measuredContentHeightRef.current) {
      measuredContentHeightRef.current = nextHeight;
      onContentHeightChange?.(nextHeight);
    }
    setEditorHeight(previousHeight => {
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

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const snapshot = selectionSnapshotRef.current;
    if (readOnly || !textarea || !snapshot || document.activeElement !== textarea) {
      return;
    }
    if (snapshot.value !== value && !snapshot.allowValueChange) {
      return;
    }

    const currentStart = textarea.selectionStart || 0;
    const currentEnd = textarea.selectionEnd || 0;
    const expected = clampSelectionSnapshot(snapshot, value);
    if (
      currentStart === expected.start &&
      currentEnd === expected.end &&
      textarea.selectionDirection === expected.direction
    ) {
      selectionSnapshotRef.current = {
        ...expected,
        allowValueChange: false,
        pendingRestore: false,
      };
      return;
    }

    textarea.setSelectionRange(expected.start, expected.end, expected.direction);
    selectionSnapshotRef.current = {
      ...expected,
      allowValueChange: false,
      pendingRestore: false,
    };
  }, [readOnly, value]);

  useEffect(() => {
    if (magicMoveEnabled && magicMoveHighlighter) {
      return;
    }

    const taskId = renderTaskIdRef.current + 1;
    renderTaskIdRef.current = taskId;

    let cancelled = false;
    const render = async () => {
      const html = await renderCodeWithShiki(value, language, isDark, highlightLines);
      if (!cancelled && renderTaskIdRef.current === taskId) {
        setCodeHtml(html);
      }
    };
    void render();

    return () => {
      cancelled = true;
    };
  }, [value, language, isDark, highlightLines, magicMoveEnabled, magicMoveHighlighter]);

  const applyMagicMoveLineHighlight = useCallback(() => {
    if (!magicMoveEnabled || !magicMoveHighlighter) {
      return;
    }
    const layer = codeLayerRef.current;
    if (!layer) return;

    const container = layer.querySelector(".code-block-shiki-magic") as HTMLElement | null;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    const contentChildren =
      children[0]?.style.position === "absolute" ? children.slice(1) : children;
    const tokens = contentChildren.filter(
      node => !node.className.includes("shiki-magic-move-leave")
    );

    const lines: HTMLElement[][] = [[]];
    tokens.forEach(node => {
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
      lineTokens.forEach(token => {
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
        saveSelectionSnapshot(textarea);
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
  }, [onChange, saveSelectionSnapshot]);

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
        saveSelectionSnapshot(textarea, { allowValueChange: true });
      },
      getLine: (line: number) => controller.getLine(line),
      lastLine: () => controller.lastLine(),
    };
  }, [controller, saveSelectionSnapshot]);

  const syncScrollPosition = useCallback(
    (source: HTMLElement, target: HTMLElement | null) => {
      if (!target) {
        return;
      }
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      syncDecorationScroll(source.scrollTop);
    },
    [syncDecorationScroll]
  );

  const handleModWheelScroll = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) {
        return;
      }

      const target = event.currentTarget;
      const maxScrollLeft = target.scrollWidth - target.clientWidth;
      if (maxScrollLeft <= 0) {
        return;
      }

      event.preventDefault();
      target.scrollLeft = clamp(target.scrollLeft + getWheelDeltaPixels(event), 0, maxScrollLeft);

      if (target === textareaRef.current) {
        syncScrollPosition(target, codeLayerRef.current);
      } else {
        syncScrollPosition(target, textareaRef.current);
      }
    },
    [syncScrollPosition]
  );

  return (
    <div
      ref={rootRef}
      className={classnames(className)}
      data-line-numbers={lineNumbers || undefined}
      data-wrap={wrap || undefined}
      style={
        {
          height: `${displayHeight ?? editorHeight}px`,
          "--ed-code-gutter-digits": Math.max(String(lines.length).length, 2),
        } as React.CSSProperties
      }
    >
      <pre ref={measureRef} className="code-block-shiki-measure" aria-hidden={true}>
        {measureContent}
      </pre>
      {needsLineLayout && (
        <div ref={linesMeasureRef} className="code-block-shiki-measure" aria-hidden={true}>
          {lines.map((line, index) => (
            <div key={index}>{line || "\u200b"}</div>
          ))}
        </div>
      )}
      {hasChangedLines && (
        <div
          className="code-block-shiki-deco"
          data-visible={changedLinesVisible || undefined}
          aria-hidden={true}
        >
          <div ref={decoInnerRef}>
            {[...changedLines!].map(index => {
              const box = lineLayout[index];
              return box ? (
                <div
                  key={index}
                  className="code-block-shiki-changed-line"
                  style={{ top: box.top, height: box.height }}
                />
              ) : null;
            })}
          </div>
        </div>
      )}
      {lineNumbers && (
        <div className="code-block-shiki-gutter" aria-hidden={true}>
          <div ref={gutterInnerRef}>
            {lineLayout.map((box, index) => (
              <div
                key={index}
                className={classnames("code-block-shiki-line-number", {
                  "is-highlighted": highlightedLineSet.has(index + 1),
                  "is-changed": changedLinesVisible && changedLines?.has(index),
                  "is-clickable": !readOnly && onLineNumberClick,
                })}
                style={{ top: box.top }}
                onMouseDown={event => {
                  // 保留 textarea 的焦点与选区
                  if (!readOnly) event.preventDefault();
                }}
                onClick={event => {
                  if (!readOnly) onLineNumberClick?.(index + 1, event);
                }}
              >
                {index + 1}
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        ref={codeLayerRef}
        className={classnames("code-block-shiki-layer", {
          "code-block-shiki-layer-readonly": readOnly,
        })}
        style={{
          overflowX: wrap ? "hidden" : "auto",
          overflowY: allowScroll ? "auto" : "hidden",
        }}
        onScroll={event => {
          if (!readOnly || !textareaRef.current) {
            return;
          }
          syncScrollPosition(event.currentTarget, textareaRef.current);
        }}
        onWheel={handleModWheelScroll}
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
          <div className="code-block-shiki-html" dangerouslySetInnerHTML={{ __html: codeHtml }} />
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        className="code-block-shiki-input"
        spellCheck={false}
        wrap={wrap ? "soft" : "off"}
        readOnly={readOnly}
        style={{
          background: "transparent",
          WebkitTextFillColor: "transparent",
          overflowX: wrap ? "hidden" : "auto",
          overflowY: allowScroll ? "auto" : "hidden",
        }}
        onChange={event => {
          selectionSnapshotRef.current = {
            start: event.target.selectionStart || 0,
            end: event.target.selectionEnd || 0,
            direction: event.target.selectionDirection,
            value: event.target.value,
            allowValueChange: true,
            pendingRestore: true,
          };
          onChange(event.target.value);
        }}
        onSelect={event => {
          if (selectionSnapshotRef.current?.pendingRestore) {
            return;
          }
          saveSelectionSnapshot(event.currentTarget);
        }}
        onBlur={onBlur}
        onContextMenu={e => {
          if (!onContextMenu) return;
          const textarea = textareaRef.current;
          if (!textarea) return;
          const start = offsetToCursor(value, textarea.selectionStart || 0).line;
          const end = offsetToCursor(value, textarea.selectionEnd || 0).line;
          onContextMenu(e, { start, end });
        }}
        onScroll={event => {
          syncScrollPosition(event.currentTarget, codeLayerRef.current);
        }}
        onWheel={handleModWheelScroll}
        onKeyDown={event => onKeyDown?.(event, helpers)}
        data-shiki-language={shikiLanguage}
      />
    </div>
  );
};

export default ShikiOverlayEditor;
