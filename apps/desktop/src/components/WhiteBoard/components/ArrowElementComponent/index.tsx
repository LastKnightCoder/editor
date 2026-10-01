import If from "@/components/If";
import { getArrowLabelKit } from "@/services/editorKit";
import { Editor, EditorRef } from "@tau/editor";
import type { IHotKeyConfig } from "@tau/editor";
import classNames from "classnames";
import { Descendant, Node } from "slate";
import { useEffect, memo, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useSelectState, useBoard } from "../../hooks";
import { ArrowElement, BoardElement, Point } from "../../types";
import Arrow from "../Arrow";
import ArrowActivePoint from "./ArrowActivePoint";
import ArrowMidPointHandle from "./ArrowMidPointHandle";
import { ArrowUtil, BoardUtil, PathUtil } from "../../utils";
import { getArrowDisplayColor } from "../../utils/color";
import useTheme from "@/hooks/useTheme";
import { getLabelAnchorByPath, offsetAnchorAlongNormal } from "./labelGeometry";
const styles = {
  descriptionContainer: "pointer-events-auto inline-flex h-fit w-fit items-center justify-start",
  descriptionEditor: "min-h-9 w-fit rounded-tau-sm",
  readonly: "[&_[data-slate-editor]]:cursor-pointer",
};

interface ArrowElementProps {
  element: ArrowElement;
}

const ARROW_LABEL_MIN_WIDTH = 80;
const ARROW_LABEL_MAX_WIDTH = 420;
const ARROW_LABEL_MIN_HEIGHT = 36;
const ARROW_LABEL_READONLY_MIN_WIDTH = 1;
const ARROW_LABEL_RENDER_PADDING = 6;
const ARROW_LABEL_EDITOR_PADDING_Y = 4;
const ARROW_LABEL_NORMAL_GAP = 1;
const ARROW_LABEL_WIDTH_BUFFER = 2;

const createEmptyDescription = (): Descendant[] => {
  return [
    {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    },
  ];
};

const normalizeDescription = (description?: Descendant[]): Descendant[] => {
  if (!description || description.length === 0) {
    return createEmptyDescription();
  }
  return description;
};

const serializeDescription = (description: Descendant[]) => {
  return JSON.stringify(description);
};

const isDescriptionEmpty = (description: Descendant[]) => {
  return description.every(node => Node.string(node).trim().length === 0);
};

const clampLabelWidth = (width: number, minWidth: number) => {
  return Math.min(ARROW_LABEL_MAX_WIDTH, Math.max(minWidth, width));
};

const measureLabelBoxByClone = (
  editor: HTMLElement,
  minWidth: number
): { width: number; height: number } | null => {
  if (typeof document === "undefined") return null;

  const clone = editor.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "-99999px";
  clone.style.top = "-99999px";
  clone.style.visibility = "hidden";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "-1";
  clone.style.width = "max-content";
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.minWidth = `${minWidth}px`;
  clone.style.minHeight = `${ARROW_LABEL_MIN_HEIGHT}px`;
  clone.style.boxSizing = "border-box";

  document.body.appendChild(clone);
  try {
    const naturalWidth = Math.ceil(Math.max(clone.offsetWidth, clone.scrollWidth));
    const nextWidth = clampLabelWidth(naturalWidth, minWidth);

    clone.style.width = `${nextWidth}px`;
    clone.style.maxWidth = `${nextWidth}px`;
    clone.style.height = "auto";

    const nextHeight = Math.max(
      ARROW_LABEL_MIN_HEIGHT,
      Math.ceil(Math.max(clone.offsetHeight, clone.scrollHeight))
    );
    return { width: nextWidth, height: nextHeight };
  } finally {
    if (clone.parentNode) {
      clone.parentNode.removeChild(clone);
    }
  }
};

const ArrowElementComponent = memo((props: ArrowElementProps) => {
  const { element } = props;
  const {
    id,
    points,
    lineWidth,
    lineType,
    source,
    target,
    sketchEnabled,
    roughness,
    dashed,
    dashArray,
    animated,
    animationSpeed,
    midPoint,
    description,
  } = element;

  const board = useBoard();
  const { isSelected } = useSelectState(element.id);
  const { isDark } = useTheme();
  const editorRef = useRef<EditorRef>(null);
  const descriptionContainerRef = useRef<HTMLDivElement>(null);
  const isEditingDescriptionRef = useRef(false);
  const [isEditingDescription, setIsEditingDescription] = useState(() =>
    board.isEditingElements.includes(id)
  );
  const normalizedDescription = useMemo(() => normalizeDescription(description), [description]);
  const [draftDescription, setDraftDescription] = useState<Descendant[]>(normalizedDescription);
  const [descriptionRevision, setDescriptionRevision] = useState(0);
  const [labelBoxSize, setLabelBoxSize] = useState(() => ({
    width: board.isEditingElements.includes(id)
      ? ARROW_LABEL_MIN_WIDTH
      : ARROW_LABEL_READONLY_MIN_WIDTH,
    height: ARROW_LABEL_MIN_HEIGHT,
  }));

  const displayColor = getArrowDisplayColor(element, isDark);
  const labelPath = useMemo(() => {
    return ArrowUtil.getArrowPath({
      lineType,
      points,
      sourceMarker: source.marker,
      targetMarker: target.marker,
      sourceConnectId: source.connectId,
      targetConnectId: target.connectId,
      sourceCustomOffset: source.customOffset,
      targetCustomOffset: target.customOffset,
      midPoint,
    });
  }, [
    lineType,
    midPoint,
    points,
    source.connectId,
    source.customOffset,
    source.marker,
    target.connectId,
    target.customOffset,
    target.marker,
  ]);
  const labelAnchor = useMemo(() => {
    return getLabelAnchorByPath(labelPath, points);
  }, [labelPath, points]);
  const displayAnchor = useMemo(() => {
    if (!labelAnchor) return null;
    if (isEditingDescription) return labelAnchor;
    const offset = labelBoxSize.height / 2 - ARROW_LABEL_EDITOR_PADDING_Y + ARROW_LABEL_NORMAL_GAP;
    return offsetAnchorAlongNormal(labelAnchor, offset);
  }, [labelAnchor, isEditingDescription, labelBoxSize.height]);
  const descriptionIsEmpty = useMemo(() => {
    return isDescriptionEmpty(draftDescription);
  }, [draftDescription]);
  const descriptionMinWidth =
    isEditingDescription && descriptionIsEmpty
      ? ARROW_LABEL_MIN_WIDTH
      : ARROW_LABEL_READONLY_MIN_WIDTH;
  const shouldRenderDescription = isEditingDescription || !descriptionIsEmpty;
  const measureDescriptionBox = useMemoizedFn(() => {
    const container = descriptionContainerRef.current;
    if (!container) return;

    const editor = container.querySelector(":scope > [data-slate-editor]") as HTMLElement | null;
    if (!editor) return;

    const measured =
      measureLabelBoxByClone(editor, descriptionMinWidth) ??
      (() => {
        const width = Math.max(editor.offsetWidth, editor.scrollWidth);
        const height = Math.max(editor.offsetHeight, editor.scrollHeight);
        return {
          width: clampLabelWidth(Math.ceil(width), descriptionMinWidth),
          height: Math.max(ARROW_LABEL_MIN_HEIGHT, Math.ceil(height)),
        };
      })();

    setLabelBoxSize(prev => {
      if (prev.width === measured.width && prev.height === measured.height) {
        return prev;
      }
      return measured;
    });
  });
  const descriptionEditorStyle = useMemo(() => {
    const base: React.CSSProperties = {
      color: isDark ? "#f3f4f6" : "#111827",
      width: "fit-content",
      minWidth: Math.min(labelBoxSize.width + ARROW_LABEL_WIDTH_BUFFER, ARROW_LABEL_MAX_WIDTH),
      maxWidth: ARROW_LABEL_MAX_WIDTH,
      minHeight: ARROW_LABEL_MIN_HEIGHT,
      height: "auto",
      boxSizing: "border-box",
      overflow: "visible",
      padding: `${ARROW_LABEL_EDITOR_PADDING_Y}px 8px`,
    };
    if (isEditingDescription) {
      return {
        ...base,
        background: isDark ? "rgba(30, 41, 59, 0.88)" : "rgba(255, 255, 255, 0.9)",
        border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.32)" : "rgba(148, 163, 184, 0.28)"}`,
        boxShadow: isDark ? "0 2px 8px rgba(2, 6, 23, 0.45)" : "0 1px 4px rgba(15, 23, 42, 0.18)",
      } as React.CSSProperties;
    }
    return {
      ...base,
      textShadow: isDark
        ? "0 1px 2px rgba(2, 6, 23, 0.9), 0 0 4px rgba(2, 6, 23, 0.7)"
        : "0 1px 2px rgba(255, 255, 255, 0.95), 0 0 4px rgba(255, 255, 255, 0.85)",
    } as React.CSSProperties;
  }, [labelBoxSize.width, isDark, isEditingDescription]);
  const labelRenderBoxSize = useMemo(() => {
    return {
      width: labelBoxSize.width + ARROW_LABEL_WIDTH_BUFFER + ARROW_LABEL_RENDER_PADDING * 2,
      height: labelBoxSize.height + ARROW_LABEL_RENDER_PADDING * 2,
    };
  }, [labelBoxSize.height, labelBoxSize.width]);
  const descriptionContainerStyle = useMemo(() => {
    return {
      padding: ARROW_LABEL_RENDER_PADDING,
    } as React.CSSProperties;
  }, []);

  const handleElementsRemove = useMemoizedFn((elements: BoardElement[]) => {
    if (elements.some(removedElement => removedElement.id === id)) {
      setIsEditingDescription(false);
      isEditingDescriptionRef.current = false;
      removeEditingElement();
      return;
    }

    const sourceBindElement = elements.find(element => element.id === source?.bindId);
    const targetBindElement = elements.find(element => element.id === target?.bindId);

    if (sourceBindElement || targetBindElement) {
      const newElement = {
        ...element,
        source: sourceBindElement ? { marker: element.source.marker } : element.source,
        target: targetBindElement ? { marker: element.target.marker } : element.target,
      };
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
      if (ops.length > 0) {
        board.apply(ops);
      }
    }
  });

  const handleElementsChange = useMemoizedFn((elements: BoardElement[]) => {
    const sourceBindElement = elements.find(element => element.id === source?.bindId);
    const targetBindElement = elements.find(element => element.id === target?.bindId);

    let sourcePoint: Point | null = null;
    let targetPoint: Point | null = null;

    if (sourceBindElement) {
      const { connectId, customOffset } = source;
      const sourceBindPoint = board.getArrowBindPoint(sourceBindElement, connectId!, customOffset);
      if (sourceBindPoint) {
        sourcePoint = sourceBindPoint;
      }
    }

    if (targetBindElement) {
      const { connectId, customOffset } = target;
      const targetBindPoint = board.getArrowBindPoint(targetBindElement, connectId!, customOffset);
      if (targetBindPoint) {
        targetPoint = targetBindPoint;
      }
    }

    const newPoints = [...points];
    if (sourcePoint) {
      newPoints[0] = sourcePoint;
    }

    if (targetPoint) {
      newPoints[newPoints.length - 1] = targetPoint;
    }

    if (sourcePoint || targetPoint) {
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const newElement = {
        ...element,
        points: newPoints,
      };
      const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
      if (ops.length > 0) {
        board.apply(ops, false);
      }
    }
  });

  const addEditingElement = useMemoizedFn(() => {
    board.isEditingElements = [
      ...board.isEditingElements.filter(editingId => editingId !== id),
      id,
    ];
  });

  const removeEditingElement = useMemoizedFn(() => {
    board.isEditingElements = board.isEditingElements.filter(editingId => editingId !== id);
  });

  const selectCurrentArrow = useMemoizedFn(() => {
    const currentArrow = (BoardUtil.getElementById(board, id) as ArrowElement | null) || element;
    board.apply(
      [
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [currentArrow],
          },
        },
      ],
      false
    );
  });

  const commitDescription = useMemoizedFn(() => {
    const currentArrow = BoardUtil.getElementById(board, id) as ArrowElement | null;
    if (!currentArrow) return;

    const nextDescription = normalizeDescription(draftDescription);
    const prevDescription = normalizeDescription(currentArrow.description);
    if (serializeDescription(prevDescription) === serializeDescription(nextDescription)) {
      return;
    }

    const path = PathUtil.getPathByElement(board, currentArrow);
    if (!path) return;

    board.apply(
      {
        type: "set_node",
        path,
        properties: {
          description: currentArrow.description,
        },
        newProperties: {
          description: nextDescription,
        },
      },
      true
    );
  });

  const finishEditingDescription = useMemoizedFn((options?: { selectArrow?: boolean }) => {
    const shouldSelectArrow = options?.selectArrow ?? true;
    if (!isEditingDescriptionRef.current) return;
    isEditingDescriptionRef.current = false;
    setIsEditingDescription(false);
    removeEditingElement();
    editorRef.current?.deselect();
    commitDescription();
    if (shouldSelectArrow) {
      selectCurrentArrow();
    }
  });

  const startEditingDescription = useMemoizedFn(() => {
    if (board.readonly) return;
    setIsEditingDescription(true);
    isEditingDescriptionRef.current = true;
    addEditingElement();
    setTimeout(() => {
      editorRef.current?.focus();
    });
  });

  const handleDescriptionChange = useMemoizedFn((value: Descendant[]) => {
    setDraftDescription(value);
  });

  const handleDescriptionFocus = useMemoizedFn(() => {
    addEditingElement();
  });

  const handleDescriptionBlur = useMemoizedFn(() => {
    setTimeout(() => {
      finishEditingDescription();
    }, 100);
  });

  const handleArrowDoubleClick = useMemoizedFn((event: React.MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    startEditingDescription();
  });

  const handleDescriptionClick = useMemoizedFn(
    (event: React.MouseEvent<SVGForeignObjectElement>) => {
      event.stopPropagation();
      selectCurrentArrow();
    }
  );

  const handleDescriptionDoubleClick = useMemoizedFn(
    (event: React.MouseEvent<SVGForeignObjectElement>) => {
      event.stopPropagation();
      startEditingDescription();
    }
  );

  const handleDescriptionPointerDown = useMemoizedFn(
    (event: React.PointerEvent<SVGForeignObjectElement>) => {
      event.stopPropagation();
      if (!isEditingDescriptionRef.current) {
        selectCurrentArrow();
      }
    }
  );

  const descriptionHotkeyConfigs = useMemo<IHotKeyConfig[]>(
    () => [
      {
        hotKey: "enter",
        action: (_editor, event) => {
          if (!isEditingDescriptionRef.current) return;
          if (event.nativeEvent.isComposing) return;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
          finishEditingDescription();
        },
      },
    ],
    [finishEditingDescription]
  );

  useEffect(() => {
    board.on("element:change", handleElementsChange);
    board.on("element:remove", handleElementsRemove);
    return () => {
      board.off("element:change", handleElementsChange);
      board.off("element:remove", handleElementsRemove);
    };
  }, [board, handleElementsChange, handleElementsRemove]);

  useEffect(() => {
    const handleOpenDescriptionEditor = (payload: { id?: string }) => {
      if (payload?.id !== id) return;
      startEditingDescription();
    };

    board.on("arrow:description:edit", handleOpenDescriptionEditor);
    return () => {
      board.off("arrow:description:edit", handleOpenDescriptionEditor);
    };
  }, [board, id, startEditingDescription]);

  useEffect(() => {
    if (isEditingDescriptionRef.current) return;
    setDraftDescription(normalizedDescription);
    setDescriptionRevision(revision => revision + 1);
  }, [normalizedDescription]);

  useEffect(() => {
    isEditingDescriptionRef.current = isEditingDescription;
  }, [isEditingDescription]);

  useEffect(() => {
    if (!shouldRenderDescription) return;

    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const setupResizeObserver = () => {
      const container = descriptionContainerRef.current;
      if (!container) return;

      const editor = container.querySelector(":scope > [data-slate-editor]") as HTMLElement | null;
      if (!editor) {
        frameId = requestAnimationFrame(setupResizeObserver);
        return;
      }

      measureDescriptionBox();
      resizeObserver = new ResizeObserver(() => {
        measureDescriptionBox();
      });
      resizeObserver.observe(editor);
    };

    frameId = requestAnimationFrame(setupResizeObserver);
    window.addEventListener("resize", measureDescriptionBox);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", measureDescriptionBox);
      resizeObserver?.disconnect();
    };
  }, [isEditingDescription, measureDescriptionBox, shouldRenderDescription]);

  useEffect(() => {
    if (!shouldRenderDescription) return;
    const frameId = requestAnimationFrame(() => {
      measureDescriptionBox();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [draftDescription, measureDescriptionBox, shouldRenderDescription]);

  useEffect(() => {
    if (!isEditingDescription) return;

    const handleGlobalPointerDownCapture = (event: PointerEvent) => {
      const container = descriptionContainerRef.current;
      const target = event.target;
      if (!container || !(target instanceof globalThis.Node)) return;
      if (container.contains(target)) return;
      finishEditingDescription({ selectArrow: false });
    };

    document.addEventListener("pointerdown", handleGlobalPointerDownCapture, true);

    return () => {
      document.removeEventListener("pointerdown", handleGlobalPointerDownCapture, true);
    };
  }, [finishEditingDescription, isEditingDescription]);

  return (
    <g onDoubleClick={handleArrowDoubleClick}>
      <Arrow
        points={points}
        lineColor={displayColor}
        lineWidth={lineWidth}
        lineType={lineType}
        sourceMarker={source.marker}
        targetMarker={target.marker}
        sourceConnectId={source.connectId}
        targetConnectId={target.connectId}
        sourceCustomOffset={source.customOffset}
        targetCustomOffset={target.customOffset}
        sketchEnabled={sketchEnabled}
        roughness={roughness}
        dashed={dashed}
        dashArray={dashArray}
        animated={animated}
        animationSpeed={animationSpeed}
        midPoint={midPoint}
      />
      {shouldRenderDescription && displayAnchor && (
        <foreignObject
          x={displayAnchor.x - labelRenderBoxSize.width / 2}
          y={displayAnchor.y - labelRenderBoxSize.height / 2}
          width={labelRenderBoxSize.width}
          height={labelRenderBoxSize.height}
          transform={
            isEditingDescription
              ? undefined
              : `rotate(${displayAnchor.angle} ${displayAnchor.x} ${displayAnchor.y})`
          }
          className="border-none"
          onPointerDown={handleDescriptionPointerDown}
          onClick={handleDescriptionClick}
          onDoubleClick={handleDescriptionDoubleClick}
        >
          <div
            ref={descriptionContainerRef}
            style={descriptionContainerStyle}
            className={classNames(styles.descriptionContainer, {
              [styles.readonly]: !isEditingDescription,
            })}
          >
            <Editor
              key={descriptionRevision}
              ref={editorRef}
              initValue={draftDescription}
              onChange={handleDescriptionChange}
              onFocus={handleDescriptionFocus}
              onBlur={handleDescriptionBlur}
              readonly={!isEditingDescription}
              hotkeyConfigs={descriptionHotkeyConfigs}
              kit={getArrowLabelKit()}
              className={styles.descriptionEditor}
              style={descriptionEditorStyle}
            />
          </div>
        </foreignObject>
      )}
      <If condition={isSelected}>
        {points.map((point, index) => (
          <ArrowActivePoint
            key={index}
            arrowElement={element}
            point={point}
            outerFill={displayColor}
            index={index}
          />
        ))}
        {/* 中间点手柄（仅对 STRAIGHT 类型的两点直线显示） */}
        <ArrowMidPointHandle arrowElement={element} />
      </If>
    </g>
  );
});

export default ArrowElementComponent;
