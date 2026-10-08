import { isKeyHotkey } from "is-hotkey";
import { FileText, Maximize2 } from "lucide-react";
import { isEditableTarget } from "@tau/ui";
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
import { ContainmentBehavior, MovementBehavior, SnapBehavior } from "../types/capabilities";
import { BoardUtil, getResizedBBox, PathUtil } from "../utils";
import DocumentElementComponent from "../components/DocumentElement";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

/** 文档卡可指向的正文实体，写法同 EntityRefKind */
export type DocumentKind = "card" | "article" | "project-item";

/**
 * 文档卡：引用一篇库里的正文（卡片 / 文章 / 项目文档）。画布上只读预览，展开后编辑；
 * 正文不存在元素上，删除元素不影响原文。只存 entityRef，不存 contentId——白板保存按 contentId 计引用。
 */
export interface DocumentElement extends CommonElement {
  type: "document";
  entityRef: { kind: DocumentKind; id: number };
  /** 插入时的标题快照：元素树行名，正文读不到时兜底 */
  title?: string;
}

/** 展开请求：宿主监听后打开阅读纸 */
export const DOCUMENT_OPEN_EVENT = "document:open";

/** 新建时的默认尺寸：卡片短，文章与项目文档竖版 */
export const DOCUMENT_DEFAULT_SIZE: Record<DocumentKind, { width: number; height: number }> = {
  card: { width: 260, height: 240 },
  article: { width: 280, height: 360 },
  "project-item": { width: 280, height: 360 },
};
const MIN_SIZE = 120;

export const isDocumentElement = (element: BoardElement | null | undefined) =>
  element?.type === "document";

export const requestOpenDocument = (board: Board, elementId: string) =>
  board.emit(DOCUMENT_OPEN_EVENT, elementId);

export class DocumentPlugin extends CommonPlugin implements IBoardPlugin {
  name = "document";

  constructor() {
    super();
    this.onResize = this.onResize.bind(this);
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        canBeContainedBy: (container: BoardElement) => container.type === "column",
      },
      movement: { behavior: MovementBehavior.Normal },
      refLine: { participatesInRefLines: true },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    if (targetElements.length === 0) {
      return [
        {
          key: "create-document",
          label: "文档",
          icon: <FileText size={14} />,
          priority: 140,
          onSelect: (ctx: ContextMenuContext) => {
            ctx.board.emit("context-menu:open-modal", { type: "document" });
          },
        },
      ];
    }
    if (targetElements.length === 1 && isDocumentElement(targetElements[0])) {
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

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (!isKeyHotkey("enter", e) || isEditableTarget(e.target)) return;
    const selected = board.selection.selectedElements;
    if (selected.length !== 1 || !isDocumentElement(selected[0])) return;
    e.preventDefault();
    requestOpenDocument(board, selected[0].id);
    return false;
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
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
