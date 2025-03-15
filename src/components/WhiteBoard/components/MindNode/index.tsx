import Editor, { EditorRef } from "@editor/index.tsx";
import If from "@/components/If";

import { BoardElement, EMarkerType, MindNodeElement } from "../../types";
import { useBoard, useSelectState } from "../../hooks";
import {
  MIND_LINE_COLORS,
  SELECT_RECT_FILL_OPACITY,
  SELECT_RECT_STROKE,
} from "../../constants";
import React, { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import useHandleResize from "./hooks/useHandleResize.ts";
import { Descendant } from "slate";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { produce } from "immer";
import { MindUtil, PathUtil } from "@/components/WhiteBoard/utils";
import CurveArrow from "@/components/WhiteBoard/components/Arrow/CurveArrow.tsx";
import { useMindNodeKeyboardNavigation } from "./hooks/useMindNodeKeyboardNavigation.ts";

interface MindNodeProps {
  element: MindNodeElement;
}

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

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
    maxWidth: 200,
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

  const childLeftMiddlePoints = useMemo(() => {
    return element.children.map((child) => {
      return {
        x: child.x,
        y: child.y + child.height / 2,
      };
    });
  }, [element]);

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
        width={isEditing ? 200 : width}
        height={height}
        style={{
          overflow: "visible",
        }}
      >
        <div
          style={containerStyle}
          ref={containerRef}
          // @ts-ignore
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width,
              height,
              background: background || "transparent",
              border: `1px solid ${border || "transparent"}`,
              borderRadius: 4,
              zIndex: -1,
              boxSizing: "border-box",
            }}
          />
          <Editor
            ref={editorRef}
            initValue={text}
            readonly={!isEditing}
            style={{
              width: "fit-content",
              maxWidth: 200,
              padding: "10px 14px",
              boxSizing: "border-box",
            }}
            onChange={onContentChange}
            onBlur={handleBlur}
            extensions={customExtensions}
          />
        </div>
      </foreignObject>

      {childLeftMiddlePoints.map((point, index) => {
        return (
          <CurveArrow
            key={index}
            sourceMarker={EMarkerType.None}
            targetMarker={EMarkerType.None}
            lineColor={
              MIND_LINE_COLORS[element.level - (1 % MIND_LINE_COLORS.length)]
            }
            lineWidth={2}
            points={[
              {
                x: element.x + element.width,
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
    </g>
  );
};

export default MindNode;
