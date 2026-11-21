import { FileText, Maximize2 } from "lucide-react";
import {
  Board,
  BoardElement,
  IBoardPlugin,
  EHandlerPosition,
  Point,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
} from "../types";
import type { ViewPort } from "../types/viewport";
import { ContainmentBehavior, MovementBehavior, SnapBehavior } from "../types/capabilities";
import { BoardUtil, getResizedBBox, PathUtil } from "../utils";
import DocumentElementComponent from "../components/DocumentElement";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

/** 文档卡可指向的实体：正文实体写法同 EntityRefKind；pdf 是一整份 PDF（pdfs.id），没有正文 */
export type DocumentKind = "card" | "article" | "project-item" | "diary-moment" | "pdf";

/**
 * 文档卡：引用一篇库里的正文（卡片 / 文章 / 项目文档 / 日记里的一条碎碎念），或一整份 PDF。画布上只读预览，展开后编辑；
 * 正文不存在元素上，删除元素不影响原文。只存 entityRef，不存 contentId——白板保存按 contentId 计引用。
 */
export interface DocumentElement extends CommonElement {
  type: "document";
  /** 正文实体身份；碎碎念的 id 是 diary_segments.id */
  entityRef?: { kind: DocumentKind; id: number };
  /** 插入时的标题快照：元素树行名，正文读不到时兜底 */
  title?: string;
}

/** 展开请求：宿主监听后打开阅读纸 */
export const DOCUMENT_OPEN_EVENT = "tau.document.open";

/** 新建时的默认尺寸：卡片与碎碎念短，文章与项目文档竖版 */
export const DOCUMENT_DEFAULT_SIZE: Record<DocumentKind, { width: number; height: number }> = {
  card: { width: 260, height: 240 },
  article: { width: 280, height: 360 },
  "project-item": { width: 280, height: 360 },
  "diary-moment": { width: 260, height: 240 },
  // A4 竖版比例
  pdf: { width: 240, height: 340 },
};
const MIN_SIZE = 120;

/**
 * 放入请求：`/`、工具栏、右键「文档」、从文档卡拖出到空白处都只发这个请求，宿主的检索面板响应。
 * - at：放入位置（画布坐标），一行内容从这里向右展开；
 * - screen：面板贴在哪里（client 坐标），缺省放在视口中央；
 * - linkFrom：放入后从这个元素连一条箭头到每个新元素。
 */
export const DOCUMENT_INSERT_EVENT = "tau.document.insert";
export interface DocumentInsertRequest {
  at: Point;
  /** at 是行的左缘还是中心，缺省左缘 */
  align?: "start" | "center";
  screen?: Point;
  linkFrom?: string;
  /** 拖出时画着的临时连线：面板关闭（放入或取消）时由宿主调用移除 */
  release?(): void;
}

/**
 * 速览：按住文档卡 250ms，或选中后按住空格，卡面原位放大到能读，松开落回。
 * 载荷为元素 id（开始）或 null（结束）；宿主的速览层响应，只读画布同样可用。
 */
export const DOCUMENT_PEEK_EVENT = "tau.document.peek";
export const DOCUMENT_PEEK_DELAY = 250;

export const requestPeekDocument = (board: Board, elementId: string | null) =>
  board.emit(DOCUMENT_PEEK_EVENT, elementId);

/** PDF 文档卡翻页：选中 PDF 卡按 [ / ]，载荷 { id, delta }；宿主写回全局「上次读到的页」 */
export const DOCUMENT_TURN_PAGE_EVENT = "tau.document.turn-page";

/** 长出相关请求：选中文档卡按 R 或点属性条「相关」，载荷为元素 id；宿主在卡旁浮出建议 */
export const DOCUMENT_RELATED_EVENT = "tau.document.related";

export const isDocumentElement = (element: BoardElement | null | undefined) =>
  element?.type === "document";

export const requestOpenDocument = (board: Board, elementId: string) =>
  board.emit(DOCUMENT_OPEN_EVENT, elementId);

export const requestInsertDocument = (board: Board, request: DocumentInsertRequest) =>
  board.emit(DOCUMENT_INSERT_EVENT, request);

/** 视口中央的放入请求（工具栏按钮、没有光标位置时） */
export function viewportInsertRequest(source: { viewPort: ViewPort }): DocumentInsertRequest {
  const { minX, minY, width, height } = source.viewPort;
  return { at: { x: minX + width / 2, y: minY + height / 2 }, align: "center" };
}

export class DocumentPlugin extends CommonPlugin implements IBoardPlugin {
  name = "document";

  constructor(private readonly actions = { create: false, open: false }) {
    super();
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
      refLine: { participatesInRefLines: true },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    if (this.actions.create && targetElements.length === 0) {
      return [
        {
          key: "create-document",
          label: "文档",
          icon: <FileText size={14} />,
          priority: 140,
          onSelect: (ctx: ContextMenuContext) => {
            requestInsertDocument(ctx.board, {
              at: ctx.viewPortPoint,
              screen: { x: ctx.clientX, y: ctx.clientY },
            });
          },
        },
      ];
    }
    if (this.actions.open && targetElements.length === 1 && isDocumentElement(targetElements[0])) {
      return [
        {
          key: "open-document",
          label: "展开",
          icon: <Maximize2 size={14} />,
          priority: 0,
          onSelect: (ctx: ContextMenuContext) => {
            requestOpenDocument(ctx.board, targetElements[0].id);
          },
        },
      ];
    }
    return [];
  }

  onResize(
    board: Board,
    element: DocumentElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio = false,
    isAdsorb = false
  ) {
    if (!this.originResizeElement) return;
    const box = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
      isPreserveRatio
    );
    // 小于下限时停在上一帧，避免拖左 / 上边时位置跳动
    if (box.width < MIN_SIZE || box.height < MIN_SIZE) return;
    const snapped = board.snap.resize({
      element,
      bounds: box,
      position,
      enabled: isAdsorb,
      preserveRatio: isPreserveRatio,
    });
    const newElement = { ...element, ...snapped };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) board.apply(ops, false);

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });
  }

  render(_board: Board, { element }: { element: DocumentElement }) {
    return (
      <DocumentElementComponent
        key={element.id}
        element={element}
        insertable={this.actions.create}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
