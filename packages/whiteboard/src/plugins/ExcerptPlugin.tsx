import {
  Board,
  BoardElement,
  IBoardPlugin,
  EHandlerPosition,
  Point,
  IElementCapabilities,
} from "../types";
import { ContainmentBehavior, MovementBehavior, SnapBehavior } from "../types/capabilities";
import { BoardUtil, getResizedBBox, PathUtil } from "../utils";
import ExcerptElementComponent from "../components/ExcerptElement";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

/** 摘录的来源：PDF 里的一处标注，或一篇正文 */
export type ExcerptSource =
  | {
      kind: "pdf";
      entity: import("@tau/db-schema/content-identities").ContentEntityReference & { kind: "pdf" };
      annotationObjectId: string;
      page: number;
    }
  | { kind: "pdf"; pdfId: number; annotationId: number | null; page: number }
  | { kind: "card" | "article" | "project-item"; id: number };

/**
 * 摘录：从阅读纸里摘下的一段原文，带来源。原文与笔记存快照（来源删除后照样显示），不进库、不建索引；
 * 回到原文由来源条发 EXCERPT_OPEN_SOURCE_EVENT，宿主打开来源并定位。
 */
export interface ExcerptElement extends CommonElement {
  type: "excerpt";
  source?: ExcerptSource;
  quote?: string;
  note?: string;
  /** 高亮色（EHighlightColor 的值），卡片左侧色条 */
  color?: string;
  /** 来源标题快照：来源条显示 */
  sourceTitle?: string;
}

export const EXCERPT_OPEN_SOURCE_EVENT = "tau.excerpt.open-source";
export const EXCERPT_DEFAULT_SIZE = { width: 280, height: 150 };
const MIN_WIDTH = 160;
const MIN_HEIGHT = 80;

export const isExcerptElement = (element: BoardElement | null | undefined) =>
  element?.type === "excerpt";

export class ExcerptPlugin extends CommonPlugin implements IBoardPlugin {
  name = "excerpt";

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
        joins: ["layout"],
      },
      movement: { behavior: MovementBehavior.Normal },
      refLine: { participatesInRefLines: true },
    };
  }

  onResize(
    board: Board,
    element: ExcerptElement,
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
    if (box.width < MIN_WIDTH || box.height < MIN_HEIGHT) return;
    const snapped = board.snap.resize({
      element,
      bounds: box,
      position,
      enabled: isAdsorb,
      preserveRatio: isPreserveRatio,
    });
    const next = { ...element, ...snapped };
    const path = PathUtil.getPathByElement(board, next);
    if (!path) return;
    const ops = BoardUtil.diffNodePatchOnly(element, next, path);
    if (ops.length > 0) board.apply(ops, false);
    SelectTransforms.updateSelectArea(board, { selectArea: null, selectedElements: [next] });
  }

  render(_board: Board, { element }: { element: ExcerptElement }) {
    return (
      <ExcerptElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
