import React, { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import Editor, { EditorRef } from "@editor/index.tsx";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import If from "@/components/If";

import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";

import CurveArrow from "../../components/Arrow/CurveArrow";
import { useBoard, useSelectState } from "../../hooks";
import { MindUtil, PathUtil } from "../../utils";
import {
  MIND_LINE_COLORS,
  SELECT_RECT_FILL_OPACITY,
  SELECT_RECT_STROKE,
} from "../../constants";
import useHandleResize from "./hooks/useHandleResize.ts";
import { useMindNodeKeyboardNavigation } from "./hooks/useMindNodeKeyboardNavigation.ts";
import { BoardElement, EMarkerType, MindNodeElement } from "../../types";

interface MindNodeProps {
  element: MindNodeElement;
}

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];
const MIND_NODE_MAX_WIDTH = 300;

const MindNode = (props: MindNodeProps) => {
  const { element } = props;

  const {
    id,
    x,
    y,
    width,
    height,
    background,
    text,
    textColor,
    border,
    defaultFocus,
    isLeftFold,
    isRightFold,
    direction,
  } = element;

  const board = useBoard();

  const [isEditing, setIsEditing] = useState(Boolean(defaultFocus));
  const [isMoving, setIsMoving] = useState(false);

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isSelected, isSelecting } = useSelectState(id);

  useEffect(() => {
    const onMovingChange = (movingElements: BoardElement[]) => {
      setIsMoving(movingElements.some((element) => element.id === id));
    };
    const onMovingEnd = () => {
      setIsMoving(false);
    };
    board.on("element:move", onMovingChange);
    board.on("element:move-end", onMovingEnd);

    return () => {
      board.off("element:move", onMovingChange);
      board.off("element:move-end", onMovingEnd);
    };
  }, [board, id]);

  const containerStyle = useMemo(() => {
    return {
      userSelect:
        isMoving || isSelecting || isSelected || !isEditing ? "none" : "auto",
      color: textColor,
      borderRadius: 4,
    } as React.CSSProperties;
  }, [isMoving, isSelecting, isSelected, isEditing, textColor]);

  const handleEditorResize = useMemoizedFn((width: number, height: number) => {
    const newElement = produce(element, (draft) => {
      // 对于左侧节点，在编辑时需要调整 x 位置使其向左扩展
      if (direction === "left" && isEditing) {
        const widthDiff = width - element.width;
        draft.x = element.x - widthDiff;
      }
      draft.width = width;
      draft.height = height;
    });

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: newElement,
    });
  });

  const { handleResize } = useHandleResize({
    maxWidth: MIND_NODE_MAX_WIDTH,
    container: containerRef.current,
    handleOnEditorSizeChange: handleEditorResize,
  });

  const handleAutoFocus = useMemoizedFn(() => {
    if (defaultFocus) {
      editorRef.current?.focus();
      const newElement = produce(element, (draft) => {
        draft.defaultFocus = false;
      });
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;
      board.apply(
        {
          type: "set_node",
          path,
          properties: element,
          newProperties: newElement,
        },
        false,
      );
    }
  });

  useEffect(() => {
    handleAutoFocus();
  }, [handleAutoFocus]);

  const handleBlur = useMemoizedFn(() => {
    handleResize.flush();
    setTimeout(() => {
      setIsEditing(false);
      board.isEditingElements = board.isEditingElements.filter(
        (eid) => eid !== id,
      );
    }, 100);

    // TODO 应该可以直接快速的知道 Root 是什么，不要每次都查
    const root = MindUtil.getRoot(board, element);
    if (!root) {
      console.error("MindNode: Root is not found");
      return;
    }

    const newRoot = MindUtil.layout(root);
    const rootPath = PathUtil.getPathByElement(board, newRoot);
    if (!rootPath) return;
    board.apply([
      {
        type: "set_node",
        path: rootPath,
        properties: root,
        newProperties: newRoot,
      },
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [element],
        },
      },
    ]);
  });

  const handleDoubleClick = useMemoizedFn(
    (
      e: React.MouseEvent<HTMLDivElement, MouseEvent<HTMLDivElement, Event>>,
    ) => {
      e.stopPropagation();
      setIsEditing(true);
      board.isEditingElements = [
        ...board.isEditingElements.filter((eid) => eid !== id),
        id,
      ];
      setTimeout(() => {
        editorRef.current?.focus();
      }, 100);

      board.apply(
        [
          {
            type: "set_selection",
            properties: board.selection,
            newProperties: {
              selectArea: null,
              selectedElements: [],
            },
          },
        ],
        false,
      );
    },
  );

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    if (!isEditing) return;

    const newElement = produce(element, (draft) => {
      draft.text = value;
    });
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: newElement,
    });
  });

  const handlePointerDown = useMemoizedFn((e: MouseEvent) => {
    // 禁止移动元素，需要选中文字
    if (isEditing) {
      e.stopPropagation();
    }
  });

  const handleToggleFold = useMemoizedFn(
    (e: MouseEvent, direction: "left" | "right") => {
      e.stopPropagation();
      e.preventDefault();

      const root = MindUtil.getRoot(board, element);
      if (!root) {
        console.error("MindNode: Root is not found");
        return;
      }

      const newRoot = MindUtil.toggleFold(root, element, direction);
      const rootPath = PathUtil.getPathByElement(board, newRoot);
      if (!rootPath) return;

      board.apply([
        {
          type: "set_node",
          path: rootPath,
          properties: root,
          newProperties: newRoot,
        },
      ]);
    },
  );

  const { handleKeyDown } = useMindNodeKeyboardNavigation(
    board,
    element,
    isSelected,
    isEditing,
    setIsEditing,
    editorRef.current,
  );

  useEffect(() => {
    // TODO 每一个节点都注册了，是否可以由一个统一处理
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const leftChildPoints = useMemo(() => {
    const leftChildren = element.children.filter(
      (child) => child.direction === "left",
    );
    const visibleLeftChildren = isLeftFold ? [] : leftChildren;

    if (isLeftFold && leftChildren.length > 0) {
      return [
        {
          x: element.x - 10,
          y: element.y + element.height / 2,
        },
      ];
    }

    return visibleLeftChildren.map((child) => ({
      x: child.x + child.width,
      y: child.y + child.height / 2,
    }));
  }, [element, isLeftFold]);

  const rightChildPoints = useMemo(() => {
    const rightChildren = element.children.filter(
      (child) => child.direction === "right",
    );
    const visibleRightChildren = isRightFold ? [] : rightChildren;

    if (isRightFold && rightChildren.length > 0) {
      return [
        {
          x: element.x + element.width + 10,
          y: element.y + element.height / 2,
        },
      ];
    }

    return visibleRightChildren.map((child) => ({
      x: child.x,
      y: child.y + child.height / 2,
    }));
  }, [element, isRightFold]);

  const leftChildren = element.children.filter(
    (child) => child.direction === "left",
  );
  const rightChildren = element.children.filter(
    (child) => child.direction === "right",
  );

  const hasLeftChildren = leftChildren.length > 0;
  const hasRightChildren = rightChildren.length > 0;

  const leftDescendants =
    leftChildren.length > 0
      ? leftChildren.reduce(
          (total, child) =>
            total + MindUtil.getChildrenByNode(child).length + 1,
          0,
        )
      : 0;

  const rightDescendants =
    rightChildren.length > 0
      ? rightChildren.reduce(
          (total, child) =>
            total + MindUtil.getChildrenByNode(child).length + 1,
          0,
        )
      : 0;

  return (
    <g>
      <If condition={isSelected}>
        <rect
          x={x}
          y={y}
          rx={4}
          ry={4}
          width={width}
          height={height}
          fillOpacity={SELECT_RECT_FILL_OPACITY}
          stroke={SELECT_RECT_STROKE}
          strokeWidth={3}
        />
      </If>
      <foreignObject
        x={x}
        y={y}
        width={isEditing ? MIND_NODE_MAX_WIDTH : width}
        height={height}
        className="overflow-visible"
      >
        <div
          style={containerStyle}
          ref={containerRef}
          // @ts-ignore
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
        >
          <div
            className="absolute left-0 top-0 rounded-4 box-border z-[-1]"
            style={{
              background: background || "transparent",
              border: `1px solid ${border || "transparent"}`,
              width,
              height,
            }}
          />
          <Editor
            ref={editorRef}
            initValue={text}
            readonly={!isEditing}
            className="w-fit p-4 box-border"
            style={{
              maxWidth: MIND_NODE_MAX_WIDTH,
            }}
            onChange={onContentChange}
            onBlur={handleBlur}
            extensions={customExtensions}
          />
        </div>
      </foreignObject>

      {/* 左侧子节点连线 */}
      {leftChildPoints.map((point, index) => {
        return (
          <CurveArrow
            key={`left-${index}`}
            sourceMarker={EMarkerType.None}
            targetMarker={EMarkerType.None}
            lineColor={
              MIND_LINE_COLORS[element.level - (1 % MIND_LINE_COLORS.length)]
            }
            lineWidth={2}
            points={[
              {
                x: element.x, // 从父节点左侧引出
                y: element.y + element.height / 2,
              },
              {
                x: point.x,
                y: point.y,
              },
            ]}
            forceVertical
          />
        );
      })}

      {/* 右侧子节点连线 */}
      {rightChildPoints.map((point, index) => {
        return (
          <CurveArrow
            key={`right-${index}`}
            sourceMarker={EMarkerType.None}
            targetMarker={EMarkerType.None}
            lineColor={
              MIND_LINE_COLORS[element.level - (1 % MIND_LINE_COLORS.length)]
            }
            lineWidth={2}
            points={[
              {
                x: element.x + element.width, // 从父节点右侧引出
                y: element.y + element.height / 2,
              },
              {
                x: point.x,
                y: point.y,
              },
            ]}
            forceVertical
          />
        );
      })}

      {/* 左侧折叠指示器 */}
      <If condition={hasLeftChildren}>
        <g
          onClick={(e) => handleToggleFold(e, "left")}
          onDoubleClick={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          className="cursor-pointer"
        >
          <circle
            cx={element.x - 10}
            cy={element.y + element.height / 2}
            r={8}
            fill={
              MIND_LINE_COLORS[element.level - (1 % MIND_LINE_COLORS.length)]
            }
          />
          <text
            x={element.x - 10}
            y={element.y + element.height / 2 + (isLeftFold ? 1 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fontWeight="bold"
            fill={"white"}
            className="select-none"
          >
            {isLeftFold ? `${leftDescendants}` : "-"}
          </text>
        </g>
      </If>

      {/* 右侧折叠指示器 */}
      <If condition={hasRightChildren}>
        <g
          onClick={(e) => handleToggleFold(e, "right")}
          onDoubleClick={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          className="cursor-pointer"
        >
          <circle
            cx={element.x + element.width + 10}
            cy={element.y + element.height / 2}
            r={8}
            fill={
              MIND_LINE_COLORS[element.level - (1 % MIND_LINE_COLORS.length)]
            }
            className="relative"
          />
          <text
            x={element.x + element.width + 10}
            y={element.y + element.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fontWeight="bold"
            fill={"white"}
            className="select-none"
          >
            {isRightFold ? `${rightDescendants}` : "-"}
          </text>
        </g>
      </If>
    </g>
  );
};

export default MindNode;
