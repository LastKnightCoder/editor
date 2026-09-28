import React, { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { getLibraryContentKit } from "@/services/editorKit";
import { Editor, EditorRef, EditorThemeOverride } from "@tau/editor/src";
import If from "@/components/If";

import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";

import CurveArrow from "../../components/Arrow/CurveArrow";
import {
  useArrowMove,
  useBoard,
  useCreateElementType,
  useElementMoving,
  useInertControl,
  useSelectState,
} from "../../hooks";
import { BoardUtil, MindThemeUtil, MindUtil, PathUtil } from "../../utils";
import { useMindMode, useMindTheme } from "../../hooks/useMindTheme";
import useHandleResize from "./hooks/useHandleResize.ts";
import { useMindNodeKeyboardNavigation } from "./hooks/useMindNodeKeyboardNavigation.ts";
import { ECreateBoardElementType, EMarkerType, MindNodeElement } from "../../types";
import { createContent, incrementContentRefCount } from "@/commands/content";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { SearchResult } from "@/types/search";

interface MindNodeProps {
  element: MindNodeElement;
}

const MIND_NODE_MAX_WIDTH = 300;

// 非编辑状态下，节点尺寸变化（尤其是折叠/展开导致的挂载/卸载）可能会让布局与 x/y 脱节。
// 这里对“同一棵思维导图(root)”做去重后的延迟重排，避免每个节点各自触发一次全量 layout。
const pendingRelayoutTimerByRootId = new Map<string, number>();

const scheduleRelayoutMindRoot = (board: ReturnType<typeof useBoard>, rootId: string) => {
  if (!rootId) return;
  if (pendingRelayoutTimerByRootId.has(rootId)) return;

  const timer = window.setTimeout(() => {
    pendingRelayoutTimerByRootId.delete(rootId);
    const latestRoot = BoardUtil.getElementById(board, rootId) as MindNodeElement | null;
    if (!latestRoot) return;
    const laidOut = MindUtil.layout(latestRoot);
    const rootPath = PathUtil.getPathByElement(board, latestRoot);
    if (!rootPath) return;

    const ops = BoardUtil.diffNode(latestRoot, laidOut, rootPath);
    BoardUtil.normalizeOperations(ops);
    // 自动重排不应影响 undo/redo 历史（尤其是 undo 之后不能清空 redos）
    board.apply(ops, false);
  }, 0);

  pendingRelayoutTimerByRootId.set(rootId, timer);
};

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const MindNode = (props: MindNodeProps) => {
  const { element } = props;

  const { id, x, y, width, height, text, defaultFocus, isLeftFold, isRightFold, direction } =
    element;

  const board = useBoard();
  const isArrowMoving = useArrowMove();
  const createBoardElementType = useCreateElementType();

  const root = useMemo(() => MindUtil.getRoot(board, element), [board, element, board.children]);
  const mindTheme = useMindTheme(root);
  const mindMode = useMindMode();
  const branchIndex = MindThemeUtil.getBranchIndex(root, id);

  const nodeStyle = MindThemeUtil.getNodeVisual(mindTheme, element.level, branchIndex, mindMode);
  // 子节点连线颜色取子节点自己的分支色（根节点的子节点各自一色）
  const childLineOf = (childId: string) =>
    MindThemeUtil.getNodeVisual(
      mindTheme,
      element.level + 1,
      element.level === 1 ? MindThemeUtil.getBranchIndex(root, childId) : branchIndex,
      mindMode
    );

  const background = nodeStyle.background;
  const textColor = nodeStyle.textColor;
  const editorTheme = nodeStyle.editorTheme;

  const [isEditing, setIsEditing] = useState(Boolean(defaultFocus));
  const isMoving = useElementMoving(id);
  const [contentSelectorOpen, setContentSelectorOpen] = useState(false);

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isSelected, isSelecting } = useSelectState(id);
  const isCreatingElement = createBoardElementType !== ECreateBoardElementType.None;
  const shouldInert = isArrowMoving || isMoving || isSelecting || isCreatingElement;

  useInertControl(containerRef, shouldInert);

  const containerStyle = useMemo(() => {
    return {
      color: textColor,
      borderRadius: 4,
    } as React.CSSProperties;
  }, [textColor]);

  const handleEditorResize = useMemoizedFn((width: number, height: number) => {
    // 如果尺寸没有变化，不更新
    if (width === element.width && height === element.height) {
      return;
    }

    const widthDiff = width - element.width;
    const nextX =
      // 思维导图左侧节点的 x 依赖 width：保持“右边缘”不动，避免宽度变化导致连接线/布局漂移
      direction === "left" ? element.x - widthDiff : element.x;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) {
      console.warn("[MindNode] Path not found for element:", element.id);
      return;
    }

    board.apply(
      {
        type: "set_node",
        path,
        properties: {
          x: element.x,
          width: element.width,
          height: element.height,
        },
        newProperties: {
          x: nextX,
          width,
          height,
        },
      },
      isEditing
    );

    // 非编辑状态下，尺寸变化需要补一次布局，避免折叠/展开 + undo/redo 后出现连接线/位置错乱
    if (!isEditing) {
      const root = MindUtil.getRoot(board, element);
      if (root) {
        scheduleRelayoutMindRoot(board, root.id);
      }
    }
  });

  const { handleResize } = useHandleResize({
    maxWidth: MIND_NODE_MAX_WIDTH,
    container: containerRef.current,
    handleOnEditorSizeChange: handleEditorResize,
  });

  const handleAutoFocus = useMemoizedFn(() => {
    if (defaultFocus) {
      setTimeout(() => {
        editorRef.current?.focus();
        const newElement = produce(element, draft => {
          draft.defaultFocus = false;
        });
        const path = PathUtil.getPathByElement(board, element);
        if (!path) return;
        board.apply(
          {
            type: "set_node",
            path,
            properties: { defaultFocus: element.defaultFocus },
            newProperties: { defaultFocus: newElement.defaultFocus },
          },
          false
        );
      }, 100);
    }
  });

  useEffect(() => {
    handleAutoFocus();
  }, [handleAutoFocus]);

  const handleBlur = useMemoizedFn(() => {
    handleResize.flush();
    setTimeout(() => {
      setIsEditing(false);
      board.isEditingElements = board.isEditingElements.filter(eid => eid !== id);
    }, 100);

    // TODO 应该可以直接快速的知道 Root 是什么，不要每次都查
    const root = MindUtil.getRoot(board, element);
    if (!root) {
      console.error("MindNode: Root is not found");
      return;
    }

    const newRoot = MindUtil.layout(root);
    const rootPath = PathUtil.getPathByElement(board, root);
    if (!rootPath) return;
    const ops = [
      ...BoardUtil.diffNode(root, newRoot, rootPath),
      {
        type: "set_selection" as const,
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [element],
        },
      },
    ];
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
  });

  const handleDoubleClick = useMemoizedFn(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent<HTMLDivElement, Event>>) => {
      e.stopPropagation();
      setIsEditing(true);
      board.isEditingElements = [...board.isEditingElements.filter(eid => eid !== id), id];
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
        false
      );
    }
  );

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    if (!isEditing) return;

    const newElement = produce(element, draft => {
      draft.text = value;
    });
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    board.apply({
      type: "set_node",
      path,
      properties: { text: element.text },
      newProperties: { text: newElement.text },
    });
  });

  const handlePointerDown = useMemoizedFn((e: MouseEvent) => {
    // 禁止移动元素，需要选中文字
    if (isEditing) {
      e.stopPropagation();
    }
  });

  const handleToggleFold = useMemoizedFn((e: MouseEvent, direction: "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();

    const root = MindUtil.getRoot(board, element);
    if (!root) {
      console.error("MindNode: Root is not found");
      return;
    }

    const newRoot = MindUtil.toggleFold(root, element, direction);
    const rootPath = PathUtil.getPathByElement(board, root);
    if (!rootPath) return;

    const ops = BoardUtil.diffNode(root, newRoot, rootPath);
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
  });

  const handleCreateNote = useMemoizedFn(async () => {
    const contentId = await createContent(DEFAULT_CONTENT, 0);
    if (!contentId) return;

    const newElement = produce(element, draft => {
      draft.contentId = contentId;
      draft.contentTitle = "";
    });
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    board.apply({
      type: "set_node",
      path,
      properties: {
        contentId: element.contentId,
        contentTitle: element.contentTitle,
      },
      newProperties: {
        contentId: newElement.contentId,
        contentTitle: newElement.contentTitle,
      },
    });

    // 自动打开笔记
    board.emit("open-note", contentId, "");
  });

  const onSelectContent = useMemoizedFn(async (items: SearchResult | SearchResult[]) => {
    const item = Array.isArray(items) ? items[0] : items;
    if (!item) return;
    if (item.contentId === element.contentId) {
      setContentSelectorOpen(false);
      return;
    }

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    await incrementContentRefCount(item.contentId);

    const newElement = produce(element, draft => {
      draft.contentId = item.contentId;
      draft.contentTitle = item.title;
    });

    board.apply({
      type: "set_node",
      path,
      properties: {
        contentId: element.contentId,
        contentTitle: element.contentTitle,
      },
      newProperties: {
        contentId: newElement.contentId,
        contentTitle: newElement.contentTitle,
      },
    });
    setContentSelectorOpen(false);
  });

  const { handleKeyDown } = useMindNodeKeyboardNavigation(
    board,
    element,
    isSelected,
    isEditing,
    setIsEditing,
    editorRef.current
  );

  useEffect(() => {
    // TODO 每一个节点都注册了，是否可以由一个统一处理
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 监听右键菜单 / 属性条触发的「新建笔记」「选择笔记」事件，仅当前节点响应
  useEffect(() => {
    const handleSelectNote = (nodeId: string) => {
      if (nodeId === element.id) {
        setContentSelectorOpen(true);
      }
    };
    const handleCreateNoteEvent = (nodeId: string) => {
      if (nodeId === element.id) {
        handleCreateNote();
      }
    };
    board.on("mind:select-note", handleSelectNote);
    board.on("mind:create-note", handleCreateNoteEvent);
    return () => {
      board.off("mind:select-note", handleSelectNote);
      board.off("mind:create-note", handleCreateNoteEvent);
    };
  }, [board, element.id, handleCreateNote]);

  const leftChildPoints = useMemo(() => {
    const leftChildren = element.children.filter(child => child.direction === "left");
    const visibleLeftChildren = isLeftFold ? [] : leftChildren;

    if (isLeftFold && leftChildren.length > 0) {
      return [
        {
          id: leftChildren[0].id,
          x: element.x - 10,
          y: element.y + element.height / 2,
        },
      ];
    }

    return visibleLeftChildren.map(child => ({
      id: child.id,
      x: child.x + child.width,
      y: child.y + child.height / 2,
    }));
  }, [element, isLeftFold]);

  const rightChildPoints = useMemo(() => {
    const rightChildren = element.children.filter(child => child.direction === "right");
    const visibleRightChildren = isRightFold ? [] : rightChildren;

    if (isRightFold && rightChildren.length > 0) {
      return [
        {
          id: rightChildren[0].id,
          x: element.x + element.width + 10,
          y: element.y + element.height / 2,
        },
      ];
    }

    return visibleRightChildren.map(child => ({
      id: child.id,
      x: child.x,
      y: child.y + child.height / 2,
    }));
  }, [element, isRightFold]);

  const leftChildren = element.children.filter(child => child.direction === "left");
  const rightChildren = element.children.filter(child => child.direction === "right");

  const hasLeftChildren = leftChildren.length > 0;
  const hasRightChildren = rightChildren.length > 0;

  const leftDescendants =
    leftChildren.length > 0
      ? leftChildren.reduce(
          (total, child) => total + MindUtil.getChildrenByNode(child).length + 1,
          0
        )
      : 0;

  const rightDescendants =
    rightChildren.length > 0
      ? rightChildren.reduce(
          (total, child) => total + MindUtil.getChildrenByNode(child).length + 1,
          0
        )
      : 0;

  const editorStyle = useMemo(() => {
    return {
      maxWidth: MIND_NODE_MAX_WIDTH,
    } as React.CSSProperties;
  }, []);

  return (
    <>
      <g>
        <If condition={isSelected}>
          <rect
            x={x - 3}
            y={y - 3}
            rx={nodeStyle.borderRadius + 3}
            ry={nodeStyle.borderRadius + 3}
            width={width + 6}
            height={height + 6}
            fill="none"
            stroke="var(--tau-accent)"
            strokeWidth={2}
          />
        </If>
        <foreignObject
          x={x}
          y={y}
          width={isEditing ? MIND_NODE_MAX_WIDTH : width}
          height={height}
          className="overflow-visible border-none"
        >
          <div
            style={containerStyle}
            ref={containerRef}
            // @ts-ignore
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
          >
            <div
              className="absolute left-0 top-0 z-[-1] box-border"
              style={{
                background: background || "transparent",
                border: `${nodeStyle.borderWidth}px solid ${nodeStyle.borderColor}`,
                borderRadius: nodeStyle.borderRadius,
                width,
                height,
              }}
            />
            <EditorThemeOverride mode={editorTheme}>
              <Editor
                kit={getLibraryContentKit()}
                ref={editorRef}
                initValue={text}
                readonly={!isEditing}
                className="box-border w-fit rounded-[4px] p-4"
                style={editorStyle}
                onChange={onContentChange}
                onBlur={handleBlur}
              />
            </EditorThemeOverride>
          </div>
        </foreignObject>

        {/* 笔记状态点：有笔记时常驻显示（hover 时也不消失） */}
        <If condition={!!element.contentId}>
          <circle
            cx={x + width - 9}
            cy={y + 9}
            r={4}
            fill={nodeStyle.accent}
            stroke="var(--tau-bg-surface)"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        </If>

        {/* 左侧子节点连线 */}
        {leftChildPoints.map((point, index) => {
          const line = childLineOf(point.id);

          return (
            <CurveArrow
              key={`left-${index}`}
              sourceMarker={EMarkerType.None}
              targetMarker={EMarkerType.None}
              lineColor={line.lineColor}
              lineWidth={line.lineWidth}
              points={[
                {
                  x: element.x,
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
          const line = childLineOf(point.id);

          return (
            <CurveArrow
              key={`right-${index}`}
              sourceMarker={EMarkerType.None}
              targetMarker={EMarkerType.None}
              lineColor={line.lineColor}
              lineWidth={line.lineWidth}
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

        {/* 左侧折叠指示器 */}
        <If condition={hasLeftChildren}>
          <g
            onClick={e => handleToggleFold(e, "left")}
            onDoubleClick={e => {
              e.stopPropagation();
            }}
            onPointerDown={e => {
              e.stopPropagation();
            }}
            className="cursor-pointer"
          >
            <circle
              cx={element.x - 10}
              cy={element.y + element.height / 2}
              r={8}
              fill={nodeStyle.accent}
            />
            <text
              x={element.x - 10}
              y={element.y + element.height / 2 + (isLeftFold ? 1 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill={nodeStyle.accentText}
              className="select-none"
            >
              {isLeftFold ? `${leftDescendants}` : "-"}
            </text>
          </g>
        </If>

        {/* 右侧折叠指示器 */}
        <If condition={hasRightChildren}>
          <g
            onClick={e => handleToggleFold(e, "right")}
            onDoubleClick={e => {
              e.stopPropagation();
            }}
            onPointerDown={e => {
              e.stopPropagation();
            }}
            className="cursor-pointer"
          >
            <circle
              cx={element.x + element.width + 10}
              cy={element.y + element.height / 2}
              r={8}
              fill={nodeStyle.accent}
              className="relative"
            />
            <text
              x={element.x + element.width + 10}
              y={element.y + element.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill={nodeStyle.accentText}
              className="select-none"
            >
              {isRightFold ? `${rightDescendants}` : "-"}
            </text>
          </g>
        </If>
      </g>
      <ContentSelectorModal
        open={contentSelectorOpen}
        onCancel={() => setContentSelectorOpen(false)}
        onSelect={onSelectContent}
        contentType={["article", "card", "project-item", "diary-daily"]}
        title="选择笔记"
      />
    </>
  );
};

export default MindNode;
