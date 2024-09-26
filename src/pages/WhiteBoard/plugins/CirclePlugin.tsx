import { Board, IBoardPlugin, BoardElement, Selection } from "../types";
import { isRectIntersect, selectAreaToRect } from "../utils";

interface CircleElement extends BoardElement {
  type: "circle",
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  center: [number, number];
  radius: number;
}

export class CirclePlugin implements IBoardPlugin {
  name = "circle";

  isHit(_board: Board, element: CircleElement, x: number, y: number): boolean {
    const { center, radius } = element;
    const [cx, cy] = center;
    return Math.pow(x - cx, 2) + Math.pow(y - cy, 2) <= Math.pow(radius, 2);
  }

  moveElement(_board: Board, element: CircleElement, dx: number, dy: number) {
    const { center } = element;
    return {
      ...element,
      center: [center[0] + dx, center[1] + dy]
    }
  }

  isElementSelected(board: Board, element: CircleElement, selectArea: Selection['selectArea'] = board.selection.selectArea) {
    if (!selectArea) return false;
    const eleRect = this.getBBox(board, element);
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(eleRect, selectRect!);
  }

  getBBox(_board: Board, element: CircleElement) {
    return {
      x: element.center[0] - element.radius,
      y: element.center[1] - element.radius,
      width: element.radius * 2,
      height: element.radius * 2
    };
  }

  render({ element }: { element: CircleElement }) {
    const { id, center, radius, fill, stroke, strokeWidth } = element;
    return <circle key={id} cx={center[0]} cy={center[1]} r={radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
}

export default CirclePlugin;
