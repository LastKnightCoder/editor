import { IBoardPlugin, ArrowElement, Board, Point, EArrowLineType } from "../types";
import ArrowElementComponent from '../components/ArrowElementComponent';
import { PathUtil, CanvasUtil } from "../utils";

export class ArrowPlugin implements IBoardPlugin {
  name = 'arrow';

  constructor() {
    this.onPointsChange = this.onPointsChange.bind(this);
  }

  isHit(_board: Board, element: ArrowElement, x: number, y: number) {
    const { points, lineType } = element;
    const padding = 10;
    if (lineType === EArrowLineType.STRAIGHT) {
      // TODO 扩展算法优化
      const upperPoints = points.map(point => ({
        x: point.x,
        y: point.y - padding,
      }));
      const lowerPoints = points.map(point => ({
        x: point.x,
        y: point.y + padding,
      })).reverse();
      const path = new Path2D();
      path.moveTo(upperPoints[0].x, upperPoints[0].y);
      for (let i = 1; i < upperPoints.length; i++) {
        path.lineTo(upperPoints[i].x, upperPoints[i].y);
      }
      for (let i = 0; i < lowerPoints.length; i++) {
        path.lineTo(lowerPoints[i].x, lowerPoints[i].y);
      }
      path.closePath();
      return CanvasUtil.isPointInPath(path, x, y);
    }
    return false;
  }

  onPointsChange(board: Board, element: ArrowElement, points: Point[]) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      points,
    }
    board.apply({
      type: 'set_node',
      path,
      properties: {},
      newProperties: newElement,
    })
  }

  render(_board: Board, { element }: { element: ArrowElement }) {
    return (
      <ArrowElementComponent
        key={element.id}
        element={element}
        onPointsChange={this.onPointsChange}
      />
    )
  }
}