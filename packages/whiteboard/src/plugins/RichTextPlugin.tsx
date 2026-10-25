import { embeddedTextOptions, type TextExtensionOptions } from "../extensions/text";
import { DOMSizeMeasurer } from "../extensions/DOMSizeMeasurer";
import { Descendant } from "slate";
import { Type, CreditCard, FileText, FolderOpen } from "lucide-react";

import {
  Board,
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
import { BoardUtil, PathUtil, PointUtil, getResizedBBox } from "../utils";
import { buildRichTextElement } from "../extensions/creators/text";

import RichText from "../components/RichText";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";
import { TextTone, TextVariant, getTextBoxPadding, resolveTextStyle } from "../constants";
import { handTextClass, resolveSketch } from "../utils/sketch";
import { RICHTEXT_TOOL_ID } from "../constants/tools";

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
  autoFocus?: boolean;
  variant?: TextVariant;
  tone?: TextTone;
  /** @deprecated 旧版外观字段，只读，由 resolveTextStyle 换算成 variant/tone */
  background?: string;
  /** @deprecated 同上 */
  topColor?: string;
}

export class RichTextPlugin extends CommonPlugin {
  name = "richtext";

  private readonly measurers = new Map<Board, DOMSizeMeasurer>();

  dispose() {
    this.measurers.forEach(measurer => measurer.cleanup());
    this.measurers.clear();
  }

  constructor(private readonly text: TextExtensionOptions = embeddedTextOptions) {
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
        joins: ["layout"],
      },
      movement: { behavior: MovementBehavior.Normal },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "emerald",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (element, targetWidth, board) => {
          const richText = element as RichTextElement;
          let measurer = this.measurers.get(board);
          if (!measurer) {
            measurer = new DOMSizeMeasurer(board, this.text.kit);
            this.measurers.set(board, measurer);
          }
          return measurer.measureRichTextHeight(
            richText.id,
            richText.content,
            targetWidth,
            getTextBoxPadding(resolveTextStyle(richText)),
            richText.contentId,
            handTextClass(resolveSketch(board.sketch, richText))
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
          ctx.board.setActiveTool(RICHTEXT_TOOL_ID);
        },
      });
    }

    if (this.text.create && targetElements.length === 1 && targetElements[0].type === "richtext") {
      const richText = targetElements[0] as RichTextElement;
      items.push({
        key: `richtext-create-as-${richText.id}`,
        label: context.board.document ? "复制为独立内容" : "创建为",
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
                  ctx.board.emit("tau.richtext.create-as", {
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
                  ctx.board.emit("tau.richtext.create-as", {
                    elementId: richText.id,
                    mode: "article",
                  });
                },
              }
            : null,
          {
            key: `richtext-create-as-project-${richText.id}`,
            label: "项目文档",
            icon: <FolderOpen size={14} />,
            priority: 264,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.richtext.create-as", {
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
    const currentPoint = PointUtil.screenToViewPort(board, event.clientX, event.clientY);
    if (!currentPoint) return;

    const { x, y } = currentPoint;
    const hitElements = BoardUtil.getHitElements(board, x, y);
    if (hitElements.length > 0) return;

    void this.insertRichText(board, x, y);
  }

  /** content 先建后插（见 createRichTextContentId），故为异步；调用方不等待；双击空白创建共用此入口 */
  private async insertRichText(board: Board, x: number, y: number) {
    const canSubmit = board.captureSubmission();
    const element = await buildRichTextElement(x, y, this.text, board);
    if (!canSubmit()) return;

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: element,
    });
  }

  onResize(
    board: Board,
    element: RichTextElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(this.originResizeElement, position, startPoint, endPoint);
    const newElement = {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    const snapped = board.snap.resize({
      element: newElement,
      bounds: newBBox,
      position,
      enabled: isAdsorb,
    });
    Object.assign(newElement, snapped, {
      maxWidth: snapped.width,
      maxHeight: snapped.height,
    });
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
    height: number
  ) => {
    if (board.document) {
      board.document.measureElement?.(element.id, { width, height });
      return;
    }
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

  private onContentChange = (board: Board, element: RichTextElement, value: Descendant[]) => {
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
    patch: Partial<RichTextElement>
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
