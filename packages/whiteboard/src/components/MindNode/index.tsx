import React, { MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { Editor, EditorRef, EditorThemeOverride } from "@tau/editor";
import { If as If } from "@tau/ui";
import { cn } from "@tau/ui";

import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import { produce } from "immer";

import CurveArrow from "../../components/Arrow/CurveArrow";
import SketchRect from "../SketchPaths/SketchRect";
import SketchStroke from "../SketchPaths/SketchStroke";
import { hashSeed } from "../../utils/sketch";
import {
  useActiveTool,
  useArrowMove,
  useBoard,
  useElementMoving,
  useInertControl,
  useSelectState,
  useSketch,
} from "../../hooks";
import { BoardUtil, MindThemeUtil, MindUtil, PathUtil } from "../../utils";
import { useMindLayout, useMindMode, useMindTheme } from "../../hooks/useMindTheme";
import useHandleResize from "./hooks/useHandleResize.ts";
import { useMindNodeKeyboardNavigation } from "./hooks/useMindNodeKeyboardNavigation.ts";
import { NotePeek } from "./NotePeek";
import { MindRanges, useMindRanges } from "./MindRanges";
import { EMarkerType, MindNodeElement } from "../../types";
import { allowsElementInteraction } from "../../constants/tools";
import { useTextExtension } from "../../extensions/text";
import { useEditingElementCleanup } from "../../hooks/useEditingElementCleanup";
type SearchResult = { contentId: number; title: string };
const EmptySelector = () => null;
import { handTextClass } from "../../utils/sketch";

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
    children: [{ type: "formatted", text: "" }],
  },
];

const MindNode = (props: MindNodeProps) => {
  const { element } = props;

  const { id, text, defaultFocus, direction } = element;

  const board = useBoard();
  const collaborativeDocument = board.document?.textDocument(element.id);
  useEditingElementCleanup(id);
  const textBinding = useTextExtension();
  const isArrowMoving = useArrowMove();
  const activeTool = useActiveTool();

  const root = useMemo(() => MindUtil.getRoot(board, element), [board, element, board.children]);
  const mindTheme = useMindTheme(root);
  const { layout, previewNodes } = useMindLayout(root);
  // 悬停布局卡片时按预览坐标画，文档不变
  const shown = previewNodes?.get(id) ?? element;
  const { x, y, width, height } = shown;
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

  // 整棵导图共用根节点的画风覆盖
  const sketch = useSketch(element, root);
  const branchSketch = (childId: string) =>
    sketch.enabled
      ? { level: sketch.level, seed: (sketch.seed ^ hashSeed(childId)) >>> 0 }
      : undefined;

  const background = nodeStyle.background;
  const textColor = nodeStyle.textColor;
  const editorTheme = nodeStyle.editorTheme;

  const [isEditing, setIsEditing] = useState(Boolean(defaultFocus));
  const isMoving = useElementMoving(id);
  const [contentSelectorOpen, setContentSelectorOpen] = useState(false);

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isSelected, isSelecting } = useSelectState(id);
  const isCreatingElement = !allowsElementInteraction(activeTool);
  const shouldInert = isArrowMoving || isMoving || isSelecting || isCreatingElement;

  useInertControl(containerRef, shouldInert);

  const containerStyle = useMemo(() => {
    return {
      color: textColor,
      borderRadius: 4,
      width: "fit-content",
      pointerEvents: "auto",
    } as React.CSSProperties;
  }, [textColor]);

  const handleEditorResize = useMemoizedFn((width: number, height: number) => {
    if (board.document) {
      board.document.measureElement?.(element.id, { width, height });
      return;
    }
    // 如果尺寸没有变化，不更新
    if (width === element.width && height === element.height) {
      return;
    }

    const widthDiff = width - element.width;
    const nextX =
      // 排在父节点左侧的节点保持右边缘不动，避免宽度变化导致连线/布局漂移
      layout.sides.length > 1 && direction === "left" ? element.x - widthDiff : element.x;

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
    containerRef,
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
    board.document?.splitHistory();
    board.isEditingElements = board.isEditingElements.filter(eid => eid !== id);
    handleResize.flush();
    setTimeout(() => {
      setIsEditing(false);
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

  const ContentSelectorModal = useTextExtension().Selector ?? EmptySelector;
  const handleCreateNote = useMemoizedFn(async () => {
    const canSubmit = board.captureSubmission(element);
    const contentId = await textBinding.create?.(DEFAULT_CONTENT, 0);
    if (!contentId) return;
    if (!canSubmit()) {
      await textBinding.release?.(contentId);
      return;
    }

    if (board.document?.linkEntity) {
      try {
        if (!(await board.document.linkEntity(element.id, "content", contentId))) {
          await textBinding.release?.(contentId);
          return;
        }
      } catch (error) {
        await textBinding.release?.(contentId);
        throw error;
      }
      board.emit("tau.note.open", contentId, "");
      return;
    }
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
    board.emit("tau.note.open", contentId, "");
  });

  const onSelectContent = useMemoizedFn(async (items: SearchResult | SearchResult[]) => {
    const item = Array.isArray(items) ? items[0] : items;
    if (!item) return;
    if (item.contentId === element.contentId) {
      setContentSelectorOpen(false);
      return;
    }

    if (board.document?.linkEntity) {
      if (await board.document.linkEntity(element.id, "content", item.contentId))
        setContentSelectorOpen(false);
      return;
    }
    const canSubmit = board.captureSubmission(element);
    await textBinding.retain?.(item.contentId);
    if (!canSubmit()) {
      await textBinding.unretain?.(item.contentId);
      return;
    }
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

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

  const retainContent = useMemoizedFn((contentId: number) => {
    void textBinding.retain?.(contentId);
  });

  const { handleKeyDown } = useMindNodeKeyboardNavigation(
    board,
    element,
    isSelected,
    isEditing,
    setIsEditing,
    editorRef.current,
    retainContent
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
    board.on("tau.mind.select-note", handleSelectNote);
    board.on("tau.mind.create-note", handleCreateNoteEvent);
    return () => {
      board.off("tau.mind.select-note", handleSelectNote);
      board.off("tau.mind.create-note", handleCreateNoteEvent);
    };
  }, [board, element.id, handleCreateNote]);

  // 连线与折叠按钮：按布局计算，单向布局只有一组子节点
  const placed = (child: MindNodeElement) => previewNodes?.get(child.id) ?? child;
  const childLines = MindUtil.stackChildren(shown).map(child => ({
    id: child.id,
    connector: layout.connector(shown, placed(child)),
  }));
  const ranges = useMindRanges(shown, layout);
  const foldHandles = layout.sides
    .map(side => {
      const kids =
        layout.sides.length > 1
          ? element.children.filter(child => child.direction === side)
          : element.children;
      if (!kids.length) return null;
      const folded = MindUtil.isFolded(layout, element, side);
      const count = kids.reduce(
        (sum, child) => sum + MindUtil.getChildrenByNode(child).length + 1,
        0
      );
      return { side, folded, count, firstChildId: kids[0].id, ...layout.foldHandle(shown, side) };
    })
    .filter(handle => handle !== null);

  const editorStyle = useMemo(() => {
    return {
      maxWidth: MIND_NODE_MAX_WIDTH,
      minWidth: 40,
      minHeight: 56,
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
        {/* 手绘：底色与外框由墨迹框承担，放在文字之下；无边框的实色节点只留淡涂，不描同色轮廓 */}
        {sketch.enabled && (
          <SketchRect
            x={x}
            y={y}
            width={width}
            height={height}
            radius={nodeStyle.borderRadius}
            fill={background || undefined}
            washAlpha={1}
            stroke={nodeStyle.borderWidth > 0 ? nodeStyle.borderColor : undefined}
            strokeWidth={Math.max(1.2, nodeStyle.borderWidth)}
            level={sketch.level}
            seed={sketch.seed}
          />
        )}
        {/* 排版可用宽度不随边框收缩，否则重新挂载会按旧尺寸反复换行。 */}
        <foreignObject
          x={x}
          y={y}
          width={MIND_NODE_MAX_WIDTH}
          height={height}
          className="overflow-visible border-none"
          style={{ pointerEvents: "none" }}
        >
          <div
            style={containerStyle}
            ref={containerRef}
            // @ts-ignore
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
          >
            <div
              className="absolute top-0 left-0 z-[-1] box-border"
              style={{
                background: (!sketch.enabled && background) || "transparent",
                border: sketch.enabled
                  ? "none"
                  : `${nodeStyle.borderWidth}px solid ${nodeStyle.borderColor}`,
                borderRadius: nodeStyle.borderRadius,
                width,
                height,
              }}
            />
            <EditorThemeOverride mode={editorTheme}>
              <Editor
                document={collaborativeDocument}
                showDragHandle={false}
                kit={textBinding.kit()}
                ref={editorRef}
                initValue={text}
                readonly={
                  !isEditing || board.readonly || Boolean(board.document && !collaborativeDocument)
                }
                className={cn(
                  "box-border w-fit rounded-[4px] p-4",
                  element.contentId && "pr-9",
                  handTextClass(sketch)
                )}
                style={editorStyle}
                onChange={board.document ? undefined : onContentChange}
                onBlur={handleBlur}
              />
            </EditorThemeOverride>
            {/* 关联笔记：图标占编辑区右侧留白，颜色跟随分支 */}
            {element.contentId ? (
              <NotePeek
                contentId={element.contentId}
                title={element.contentTitle ?? ""}
                color={nodeStyle.accent}
                style={{ left: width - 30, top: 16 }}
                onOpen={() =>
                  board.emit("tau.note.open", element.contentId, element.contentTitle ?? "")
                }
                onUnlink={
                  board.readonly
                    ? undefined
                    : () => board.emit("tau.mind.confirm-unlink-note", element.id)
                }
              />
            ) : null}
          </div>
        </foreignObject>

        <MindRanges
          board={board}
          rootId={root?.id ?? element.id}
          ranges={ranges}
          lineOf={childLineOf}
          dark={mindMode === "dark"}
          sketch={sketch}
        />

        {childLines.map(({ id: childId, connector }) => {
          const line = childLineOf(childId);
          return connector.kind === "curve" ? (
            <CurveArrow
              key={childId}
              sourceMarker={EMarkerType.None}
              targetMarker={EMarkerType.None}
              lineColor={line.lineColor}
              lineWidth={line.lineWidth}
              points={[connector.from, connector.to]}
              forceVertical
              sketch={branchSketch(childId)}
            />
          ) : sketch.enabled ? (
            <SketchStroke
              key={childId}
              d={connector.d}
              color={line.lineColor}
              strokeWidth={line.lineWidth}
              level={sketch.level}
              seed={(sketch.seed ^ hashSeed(childId)) >>> 0}
            />
          ) : (
            <path
              key={childId}
              d={connector.d}
              stroke={line.lineColor}
              strokeWidth={line.lineWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* 收起后的短连线：从节点边缘接到计数按钮 */}
        {foldHandles
          .filter(handle => handle.folded)
          .map(handle => {
            const line = childLineOf(handle.firstChildId);
            return (
              <line
                key={`stem-${handle.side}`}
                x1={handle.from.x}
                y1={handle.from.y}
                x2={handle.at.x}
                y2={handle.at.y}
                stroke={line.lineColor}
                strokeWidth={line.lineWidth}
              />
            );
          })}

        {foldHandles.map(handle => (
          <g
            key={`fold-${handle.side}`}
            onClick={e => handleToggleFold(e, handle.side)}
            onDoubleClick={e => {
              e.stopPropagation();
            }}
            onPointerDown={e => {
              e.stopPropagation();
            }}
            className="cursor-pointer"
          >
            <circle cx={handle.at.x} cy={handle.at.y} r={8} fill={nodeStyle.accent} />
            <text
              x={handle.at.x}
              y={handle.at.y + (handle.folded ? 1 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill={nodeStyle.accentText}
              className="select-none"
            >
              {handle.folded ? `${handle.count}` : "-"}
            </text>
          </g>
        ))}
      </g>
      <ContentSelectorModal
        open={contentSelectorOpen}
        onCancel={() => setContentSelectorOpen(false)}
        onSelect={onSelectContent}
        contentType={["article", "card", "project-item", "diary-moment"]}
        title="选择笔记"
      />
    </>
  );
};

export default MindNode;
