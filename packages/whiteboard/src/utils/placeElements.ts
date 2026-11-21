import { v4 as uuid } from "uuid";
import type { ArrowElement, BoardElement, Point } from "../types";
import type { Operation } from "../types/operation";
import type { Selection } from "../types/selection";
import { ARROW_CONNECT_ID } from "../constants/arrow";
import { getPrevArrowStylePreset } from "./ArrowStyleUtil";

const ROW_GAP = 32;

export interface PlaceSize {
  width: number;
  height: number;
}

/**
 * 把一组尺寸从左到右排成一行，行高居中对齐落点。
 * start：落点是行的左缘（光标、拖拽松手处，内容向右展开，不盖住落点左侧）；center：落点是行的中心（视口中央）。
 */
export function layoutRow(
  at: Point,
  sizes: readonly PlaceSize[],
  align: "start" | "center" = "start",
  gap = ROW_GAP
) {
  const rowWidth = sizes.reduce((sum, size) => sum + size.width, 0) + gap * (sizes.length - 1);
  let x = align === "center" ? at.x - rowWidth / 2 : at.x;
  return sizes.map(size => {
    const box = { x, y: at.y - size.height / 2, ...size };
    x += size.width + gap;
    return box;
  });
}

type Side = "left" | "right" | "top" | "bottom";

/** 两个盒子之间箭头的出入边：横向距离占优走左右，否则走上下 */
function facingSides(from: BoardElement, to: BoardElement): [Side, Side] {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function sidePoint(element: BoardElement, side: Side): Point {
  const { x, y, width, height } = element;
  switch (side) {
    case "left":
      return { x, y: y + height / 2 };
    case "right":
      return { x: x + width, y: y + height / 2 };
    case "top":
      return { x: x + width / 2, y };
    case "bottom":
      return { x: x + width / 2, y: y + height };
  }
}

/** 两端都绑定的箭头，样式沿用上次画箭头时的预设 */
export function createLinkArrow(from: BoardElement, to: BoardElement): ArrowElement {
  const preset = getPrevArrowStylePreset();
  const [fromSide, toSide] = facingSides(from, to);
  return {
    id: uuid(),
    type: "arrow",
    lineType: preset.lineType,
    source: {
      marker: preset.sourceMarker,
      bindId: from.id,
      connectId: ARROW_CONNECT_ID[upper(fromSide)],
    },
    target: {
      marker: preset.targetMarker,
      bindId: to.id,
      connectId: ARROW_CONNECT_ID[upper(toSide)],
    },
    points: [sidePoint(from, fromSide), sidePoint(to, toSide)],
    lineWidth: preset.lineWidth,
    themeColorId: preset.themeColorId,
    dashed: preset.dashed,
    dashArray: preset.dashArray,
    animated: preset.animated,
    animationSpeed: preset.animationSpeed,
  };
}

const upper = (side: Side) => side.toUpperCase() as "LEFT" | "RIGHT" | "TOP" | "BOTTOM";

/**
 * 一次放入的全部操作：插入元素、可选地从 linkFrom 各连一条箭头到新元素、选中新元素。
 * 由调用方一次 apply，放入与连线同属一步撤销。
 */
export function buildPlacement(options: {
  elements: readonly BoardElement[];
  /** 插入位置的起始下标（通常是 children.length） */
  index: number;
  selection: Selection;
  linkFrom?: BoardElement | null;
  keepSelection?: boolean;
  /** 连线画成虚线（摘录连回来源） */
  dashedLink?: boolean;
}): Operation[] {
  const { elements, index, selection, linkFrom, keepSelection, dashedLink } = options;
  const arrows = linkFrom
    ? elements.map(element => {
        const arrow = createLinkArrow(linkFrom, element);
        return dashedLink ? { ...arrow, dashed: true, dashArray: [6, 6] } : arrow;
      })
    : [];
  return [
    ...[...elements, ...arrows].map((node, offset) => ({
      type: "insert_node" as const,
      path: [index + offset],
      node,
    })),
    ...(keepSelection
      ? []
      : [
          {
            type: "set_selection" as const,
            properties: selection,
            newProperties: { selectArea: null, selectedElements: [...elements] },
          },
        ]),
  ];
}
