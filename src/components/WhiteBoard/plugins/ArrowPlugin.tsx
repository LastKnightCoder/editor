import intersect from 'path-intersection';
import { IBoardPlugin, ArrowElement, Board, Point, SelectArea } from "../types";
import ArrowElementComponent from '../components/ArrowElementComponent';
import { ArrowUtil, CanvasUtil, selectAreaToRect } from "../utils";

export class ArrowPlugin implements IBoardPlugin {
  name = 'arrow';

  private getArrowPaddingPath(points: Point[], padding: number) {
    const upperPoints = points.map(point => ({
      x: point.x,
      y: point.y - padding,
    }));
    const lowerPoints = points.map(point => ({
      x: point.x,
      y: point.y + padding,
    })).reverse();

    const leftPoints = points.map(point => ({
      x: point.x - padding,
      y: point.y,
    }));
    const rightPoints = points.map(point => ({
      x: point.x + padding,
      y: point.y,
    })).reverse();

    return {
      upperPoints,
      lowerPoints,
      leftPoints,
      rightPoints
    }
  }

  private generateSvgPathFromPoints(points: Point[], isClose = false) {
    if (points.length === 0) return '';
    let path = '';
    const start = points[0]
    path += `M${start.x},${start.y}`;

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      path += ` L${point.x},${point.y}`;
    }
    if (isClose) {
      path += ' Z';
    }
    return path;
  }

  isHit(_board: Board, element: ArrowElement, x: number, y: number) {
    const { points, lineType, lineWidth, source: { marker: sourceMarker }, target: { marker: targetMarker } } = element;

    const path = ArrowUtil.getArrowPath({
      points,
      lineType,
      sourceMarker,
      targetMarker
    });

    if (path) {
      // 创建路径，判断 isPointInStroke
      return CanvasUtil.isPointInStroke(new Path2D(path), Math.max(lineWidth, 10), x, y);
    }

    return false;
  }

  moveElement(_board: Board, element: ArrowElement, dx: number, dy: number) {
    const { source, target } = element;
    if (source.bindId || target.bindId) return null;

    return {
      ...element,
      points: element.points.map(point => ({
        x: point.x + dx,
        y: point.y + dy,
      })),
    }
  }

  isElementSelected(board: Board, element: ArrowElement, selectArea: SelectArea | null = board.selection.selectArea) {
    if (!selectArea) return false;
    const { points } = element;
    const { x,  y, width, height } = selectAreaToRect(selectArea);
    const {
      upperPoints,
      lowerPoints,
      leftPoints,
      rightPoints
    } = this.getArrowPaddingPath(points, 10);

    const yPath = this.generateSvgPathFromPoints(upperPoints.concat(lowerPoints), true);
    const xPath = this.generateSvgPathFromPoints(leftPoints.concat(rightPoints), true);
    const selectPath = this.generateSvgPathFromPoints([
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height }
    ], true)

    return (
      intersect(xPath, selectPath).length > 0 || 
      intersect(yPath, selectPath).length > 0 || 
      points.some(point => CanvasUtil.isPointInPath(new Path2D(selectPath), point.x, point.y))
    )
  }

  render(_board: Board, { element }: { element: ArrowElement }) {
    return (
      <ArrowElementComponent
        key={element.id}
        element={element}
      />
    )
  }
}
