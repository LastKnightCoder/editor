import React, { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Editor, EditorRef } from "@tau/editor/src";
import If from "@/components/If";
import { Dropdown, MenuProps } from "antd";
import { StickyNote } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

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
import { BoardUtil, MindUtil, PathUtil } from "../../utils";
import { getThemeById } from "../../constants/mind-themes";
import useHandleResize from "./hooks/useHandleResize.ts";
import { useMindNodeKeyboardNavigation } from "./hooks/useMindNodeKeyboardNavigation.ts";
import {
  ECreateBoardElementType,
  EMarkerType,
  MindNodeElement,
} from "../../types";
import { createContent, incrementContentRefCount } from "@/commands/content";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { SearchResult } from "@/types/search";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface MindNodeProps {
  element: MindNodeElement;
}

const MIND_NODE_MAX_WIDTH = 300;

// 非编辑状态下，节点尺寸变化（尤其是折叠/展开导致的挂载/卸载）可能会让布局与 x/y 脱节。
// 这里对“同一棵思维导图(root)”做去重后的延迟重排，避免每个节点各自触发一次全量 layout。
const pendingRelayoutTimerByRootId = new Map<string, number>();

const scheduleRelayoutMindRoot = (
  board: ReturnType<typeof useBoard>,
  rootId: string,
) => {
  if (!rootId) return;
  if (pendingRelayoutTimerByRootId.has(rootId)) return;

  const timer = window.setTimeout(() => {
    pendingRelayoutTimerByRootId.delete(rootId);
    const latestRoot = BoardUtil.getElementById(
      board,
      rootId,
    ) as MindNodeElement | null;
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
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );

  const {
    id,
    x,
    y,
    width,
    height,
    text,
    defaultFocus,
    isLeftFold,
    isRightFold,
    direction,
  } = element;

  const board = useBoard();
  const isArrowMoving = useArrowMove();
  const createBoardElementType = useCreateElementType();

  const root = useMemo(
    () => MindUtil.getRoot(board, element),
    [board, element, board.children],
  );
  const themeId = root?.themeId || MindUtil.getDefaultThemeId();
  const mindTheme = useMemo(() => getThemeById(themeId), [themeId]);

  const nodeStyle = useMemo(() => {
    if (element.level === 1) {
      return {
        background: mindTheme.root.background,
        textColor: mindTheme.root.color,
        borderRadius: mindTheme.root.borderRadius,
        borderColor: mindTheme.root.borderColor || "transparent",
        borderWidth: mindTheme.root.borderWidth || 0,
        editorTheme: mindTheme.root.color === "#ffffff" ? "dark" : "light",
      };
    } else {
      const colorIndex = (element.level - 2) % mindTheme.palette.length;
      const paletteItem = mindTheme.palette[colorIndex];

      return {
        background: paletteItem.background,
        textColor: paletteItem.color,
        borderRadius: mindTheme.node.borderRadius,
        borderColor: mindTheme.node.borderColor,
        borderWidth: mindTheme.node.borderWidth,
        editorTheme: paletteItem.type,
      };
    }
  }, [element.level, mindTheme]);

  const background = nodeStyle.background;
  const textColor = nodeStyle.textColor;
  const editorTheme = nodeStyle.editorTheme as "light" | "dark";

  const [isEditing, setIsEditing] = useState(Boolean(defaultFocus));
  const isMoving = useElementMoving(id);
  const [contentSelectorOpen, setContentSelectorOpen] = useState(false);
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);

  const [isNodeHovered, setIsNodeHovered] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const setNodeHovered = useMemoizedFn((v: boolean) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (v) {
      setIsNodeHovered(true);
    } else {
      hoverTimerRef.current = window.setTimeout(() => {
        setIsNodeHovered(false);
        hoverTimerRef.current = null;
      }, 120);
    }
  });

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isSelected, isSelecting } = useSelectState(id);
  const isCreatingElement =
    createBoardElementType !== ECreateBoardElementType.None;
  const shouldInert =
    isArrowMoving || isMoving || isSelecting || isCreatingElement;

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
      isEditing,
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
        const newElement = produce(element, (draft) => {
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
          false,
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
      const rootPath = PathUtil.getPathByElement(board, root);
      if (!rootPath) return;

      const ops = BoardUtil.diffNode(root, newRoot, rootPath);
      BoardUtil.normalizeOperations(ops);
      board.apply(ops);
    },
  );

  const handleCreateNote = useMemoizedFn(async () => {
    const contentId = await createContent(DEFAULT_CONTENT, 0);
    if (!contentId) return;

    const newElement = produce(element, (draft) => {
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

  const handleSelectNote = useMemoizedFn(() => {
    setContentSelectorOpen(true);
  }) satisfies MenuProps["onClick"];

  const onSelectContent = useMemoizedFn(
    async (items: SearchResult | SearchResult[]) => {
      const item = Array.isArray(items) ? items[0] : items;
      if (!item) return;
      if (item.contentId === element.contentId) {
        setContentSelectorOpen(false);
        return;
      }

      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      await incrementContentRefCount(item.contentId);

      const newElement = produce(element, (draft) => {
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
    },
  );

  const handleOpenNote = useMemoizedFn(() => {
    if (element.contentId) {
      board.emit("toggle-note", element.contentId, element.contentTitle);
    }
  });

  const noteMenuProps: MenuProps = {
    items: [
      {
        key: "new",
        label: "新建笔记",
        onClick: handleCreateNote,
      },
      {
        key: "select",
        label: "选择笔记",
        onClick: handleSelectNote,
      },
    ],
  };

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

  // 监听右键菜单触发的「选择笔记」事件，仅当前节点响应
  useEffect(() => {
    const handleSelectNote = (nodeId: string) => {
      if (nodeId === element.id) {
        setContentSelectorOpen(true);
      }
    };
    board.on("mind:select-note", handleSelectNote);
    return () => {
      board.off("mind:select-note", handleSelectNote);
    };
  }, [board, element.id]);

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
            x={x}
            y={y}
            rx={nodeStyle.borderRadius}
            ry={nodeStyle.borderRadius}
            width={width}
            height={height}
            fill="none"
            stroke={`color-mix(in srgb, ${background} 70%, black)`}
            strokeWidth={3}
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
            onMouseEnter={() => setNodeHovered(true)}
            onMouseLeave={() => setNodeHovered(false)}
          >
            <div
              className="absolute left-0 top-0 box-border z-[-1]"
              style={{
                background: background || "transparent",
                border: `${nodeStyle.borderWidth}px solid ${nodeStyle.borderColor}`,
                borderRadius: nodeStyle.borderRadius,
                width,
                height,
              }}
            />
            <Editor
              ref={editorRef}
              initValue={text}
              readonly={!isEditing}
              className="w-fit p-4 box-border rounded-[4px]"
              style={editorStyle}
              onChange={onContentChange}
              onBlur={handleBlur}
              extensions={dynamicExtensions}
              theme={editorTheme}
            />
          </div>
        </foreignObject>

        {/* 笔记状态点：有笔记时常驻显示（hover 时也不消失） */}
        <If condition={!!element.contentId}>
          <circle
            cx={x + width - 9}
            cy={y + 9}
            r={4}
            fill={editorTheme === "dark" ? "#fbbf24" : "#475569"}
            stroke={background}
            strokeWidth={1.5}
            pointerEvents="none"
          />
        </If>

        {/* 笔记操作 icon：hover/选中/菜单打开时浮现于节点右上角外侧（带动画） */}
        <foreignObject
          x={x + width - 12}
          y={y - 24}
          width={24}
          height={24}
          className="overflow-visible border-none"
          style={{
            pointerEvents:
              isNodeHovered || isSelected || isNoteMenuOpen ? "auto" : "none",
          }}
        >
          <AnimatePresence>
            {(isNodeHovered || isSelected || isNoteMenuOpen) && (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {element.contentId ? (
                  <div
                    className="w-6 h-6 bg-white rounded-full border border-gray-200 flex items-center justify-center cursor-pointer text-blue-500 hover:border-blue-400 transition-colors"
                    onClick={handleOpenNote}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseEnter={() => setNodeHovered(true)}
                    onMouseLeave={() => setNodeHovered(false)}
                    title="打开笔记"
                  >
                    <StickyNote size={13} strokeWidth={1.75} />
                  </div>
                ) : (
                  <Dropdown
                    menu={noteMenuProps}
                    trigger={["click"]}
                    open={isNoteMenuOpen}
                    onOpenChange={setIsNoteMenuOpen}
                    dropdownRender={(menu) => (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => setNodeHovered(true)}
                      >
                        {menu}
                      </div>
                    )}
                  >
                    <div
                      className="w-6 h-6 bg-white rounded-full border border-gray-200 flex items-center justify-center cursor-pointer text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
                      onDoubleClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseEnter={() => setNodeHovered(true)}
                      onMouseLeave={() => setNodeHovered(false)}
                      title="关联笔记"
                    >
                      <StickyNote size={13} strokeWidth={1.75} />
                    </div>
                  </Dropdown>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </foreignObject>

        {/* 左侧子节点连线 */}
        {leftChildPoints.map((point, index) => {
          const childLevel = element.level + 1;
          const lineColorIndex = (childLevel - 2) % mindTheme.palette.length;
          const lineColor =
            childLevel === 1
              ? mindTheme.root.background
              : mindTheme.palette[lineColorIndex].background;

          return (
            <CurveArrow
              key={`left-${index}`}
              sourceMarker={EMarkerType.None}
              targetMarker={EMarkerType.None}
              lineColor={lineColor}
              lineWidth={2}
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
          const childLevel = element.level + 1;
          const lineColorIndex = (childLevel - 2) % mindTheme.palette.length;
          const lineColor =
            childLevel === 1
              ? mindTheme.root.background
              : mindTheme.palette[lineColorIndex].background;

          return (
            <CurveArrow
              key={`right-${index}`}
              sourceMarker={EMarkerType.None}
              targetMarker={EMarkerType.None}
              lineColor={lineColor}
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
              fill={nodeStyle.background}
            />
            <text
              x={element.x - 10}
              y={element.y + element.height / 2 + (isLeftFold ? 1 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill={nodeStyle.textColor}
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
              fill={nodeStyle.background}
              className="relative"
            />
            <text
              x={element.x + element.width + 10}
              y={element.y + element.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill={nodeStyle.textColor}
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
        contentType={[
          "article",
          "card",
          "document-item",
          "project-item",
          "diary-daily",
        ]}
        extensions={dynamicExtensions}
        title="选择笔记"
      />
    </>
  );
};

export default MindNode;
