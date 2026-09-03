import { Descendant } from "slate";
import { v4 as getUuid } from "uuid";
import {
  Type,
  CreditCard,
  FileText,
  BookOpenText,
  FolderOpen,
} from "lucide-react";

import {
  Board,
  ECreateBoardElementType,
  EHandlerPosition,
  Point,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import {
  BoardUtil,
  PathUtil,
  PointUtil,
  RichTextUtil,
  getResizedBBox,
} from "../utils";
import { DOMSizeMeasurer } from "../services/DOMSizeMeasurer";
import RichText from "../components/RichText";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";
import { EShadowSize } from "../constants";

export interface RichTextElement extends CommonElement {
  type: "richtext";
  content: Descendant[];
  contentId?: number;
  contentTitle?: string;
  linkedCardId?: number;
  linkedArticleId?: number;
  readonly?: boolean;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  paddingWidth?: number;
  paddingHeight?: number;
  autoFocus?: boolean;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  background?: string;
  topColor?: string;
  color?: string;
  theme?: "light" | "dark";
  shadowSize?: EShadowSize;
}

export class RichTextPlugin extends CommonPlugin {
  name = "richtext";

  constructor() {
    super();
    this.onDblClick = this.onDblClick.bind(this);
    this.onEditorSizeChange = this.onEditorSizeChange.bind(this);
    this.onContentChange = this.onContentChange.bind(this);
    this.removeAutoFocus = this.removeAutoFocus.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        // 58f0660e53ef5165 ColumnFf0851c651654e0e542675315b5065b958f0660e53cd8f6c51b35b9aFf0c89c1 CapabilityService.canContainFf09
        canBeContainedBy: (container) => container.type === "column",
      },
      movement: { behavior: MovementBehavior.Normal },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "emerald",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (element, targetWidth) => {
          const richText = element as RichTextElement;
          return DOMSizeMeasurer.measureRichTextHeight(
            richText.id,
            richText.content,
            targetWidth,
            richText.paddingWidth || 16,
            richText.paddingHeight || 16,
          );
        },
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「创建文本」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-text",
        label: "文本",
        icon: <Type size={14} />,
        priority: 120,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.Text;
        },
      });
    }

    if (targetElements.length === 1 && targetElements[0].type === "richtext") {
      const richText = targetElements[0] as RichTextElement;
      items.push({
        key: `richtext-create-as-${richText.id}`,
        label: "创建为",
        icon: <FolderOpen size={14} />,
        priority: 260,
        children: [
          !richText.linkedCardId
            ? {
                key: `richtext-create-as-card-${richText.id}`,
                label: "卡片",
                icon: <CreditCard size={14} />,
                priority: 261,
                onSelect: (ctx: ContextMenuContext) => {
                  ctx.board.emit("richtext:create-as", {
                    elementId: richText.id,
                    mode: "card",
                  });
                },
              }
            : null,
          !richText.linkedArticleId
            ? {
                key: `richtext-create-as-article-${richText.id}`,
                label: "文章",
                icon: <FileText size={14} />,
                priority: 262,
                onSelect: (ctx: ContextMenuContext) => {
                  ctx.board.emit("richtext:create-as", {
                    elementId: richText.id,
                    mode: "article",
                  });
                },
              }
            : null,
          {
            key: `richtext-create-as-document-${richText.id}`,
            label: "知识库文档",
            icon: <BookOpenText size={14} />,
            priority: 263,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("richtext:create-as", {
                elementId: richText.id,
                mode: "document",
              });
            },
          },
          {
            key: `richtext-create-as-project-${richText.id}`,
            label: "项目文档",
            icon: <FolderOpen size={14} />,
            priority: 264,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("richtext:create-as", {
                elementId: richText.id,
                mode: "project",
              });
            },
          },
        ].filter(Boolean) as PluginContextMenuItem[],
        onSelect: () => {},
      });
    }

    return items;
  }

  onDblClick(event: MouseEvent, board: Board) {
    const currentPoint = PointUtil.screenToViewPort(
      board,
      event.clientX,
      event.clientY,
    );
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const hitElements = BoardUtil.getHitElements(board, x, y);
    if (hitElements.length > 0) return;

    const element: RichTextElement = {
      id: getUuid(),
      type: "richtext",
      x,
      y,
      width: 180,
      height: 72,
      maxWidth: 300,
      maxHeight: 1000,
      readonly: false,
      resized: false,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
      paddingWidth: 16,
      paddingHeight: 16,
      autoFocus: true,
      ...RichTextUtil.getPrevRichtextStyle(),
    };

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: element,
    });
  }

  onClick(e: MouseEvent, board: Board) {
    if (board.currentCreateType !== ECreateBoardElementType.Text) {
      return;
    }

    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const element: RichTextElement = {
      id: getUuid(),
      type: "richtext",
      x,
      y,
      width: 180,
      height: 72,
      maxWidth: 300,
      maxHeight: 1000,
      readonly: false,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
      paddingWidth: 16,
      paddingHeight: 8,
      autoFocus: true,
      resized: false,
      ...RichTextUtil.getPrevRichtextStyle(),
    };
    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: element,
    });

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [],
    });

    board.currentCreateType = ECreateBoardElementType.None;
  }

  onResize(
    board: Board,
    element: RichTextElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false,
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
    );
    const newElement = {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    board.refLine.setCurrentRects([
      {
        key: newElement.id,
        ...newBBox,
      },
    ]);
    const updateElement = board.refLine.getUpdateCurrent(
      isAdsorb,
      5 / board.viewPort.zoom,
      true,
      position,
    );
    board.refLine.setCurrent(updateElement);
    newElement.x = updateElement.rects[0].x;
    newElement.y = updateElement.rects[0].y;
    newElement.width = updateElement.rects[0].width;
    newElement.height = updateElement.rects[0].height;
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops, false);
    }

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });
  }

  private removeAutoFocus = (board: Board, element: RichTextElement) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      autoFocus: false,
    };
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
  };

  private onEditorSizeChange = (
    board: Board,
    element: RichTextElement,
    width: number,
    height: number,
  ) => {
    const { width: w, height: h } = element;
    if (w === width && h === height) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
    };
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
  };

  private onContentChange = (
    board: Board,
    element: RichTextElement,
    value: Descendant[],
  ) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;
    const newElement = {
      ...element,
      content: value,
    };
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
  };

  private onElementChange = (
    board: Board,
    element: RichTextElement,
    patch: Partial<RichTextElement>,
  ) => {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      ...patch,
    };
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
  };

  render(_board: Board, { element }: { element: RichTextElement }) {
    const { id } = element;
    return (
      <RichText
        key={id}
        element={element}
        onContentChange={this.onContentChange}
        onEditorSizeChange={this.onEditorSizeChange}
        onElementChange={this.onElementChange}
        removeAutoFocus={this.removeAutoFocus}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
