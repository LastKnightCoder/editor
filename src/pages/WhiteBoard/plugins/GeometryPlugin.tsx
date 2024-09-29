import { Board, IBoardPlugin, BoardElement, Selection, EHandlerPosition, Point } from "../types";
import { isRectIntersect, PointUtil, selectAreaToRect, getResizedBBox } from "../utils";

interface GeometryElement extends BoardElement {
  type: "geometry",
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  paths: string[];
  width: number;
  height: number;
  x: number;
  y: number;
}

export class GeometryPlugin implements IBoardPlugin {
  name = "geometry";

  isHit(_board: Board, element: GeometryElement, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: GeometryElement, dx: number, dy: number) {
    return {
      ...element,
      x: element.x + dx,
      y: element.y + dy
    }
  }

  resizeElement(_board: Board, element: GeometryElement, options: { position: EHandlerPosition, anchor: Point, focus: Point }) {
    const { position, anchor, focus } = options;
    const newBBox = getResizedBBox(element, position, anchor, focus);
    return {
      ...element,
      ...newBBox
    }
  }

  // TODO 优化，如何判断两个路径是否有重合的区域
  isElementSelected(board: Board, element: GeometryElement, selectArea: Selection['selectArea'] = board.selection.selectArea) {
    if (!selectArea) return false;
    const eleRect = this.getBBox(board, element);
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(eleRect, selectRect);
  }

  getBBox(_board: Board, element: GeometryElement) {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    }
  }

  private transformPath(pathString: string, scaleX: number, scaleY: number) {
    // 正则表达式匹配所有路径命令及其参数
    const commands = pathString.match(/[a-zA-Z][^a-zA-Z]*/g);

    if (!commands) return pathString;

    const transformedCommands = commands?.map(command => {
      const type = command[0]; // 获取命令类型
      const coords = command.slice(1).trim().split(/[\s,]+/); // 获取坐标部分

      // 变换坐标
      const transformedCoords = coords.map((coord, index) => {
        // 对于 A 指令需要特殊处理，只需要处理起点坐标和重点坐标
        if (type.toUpperCase() === 'A') {
          if (index === 0 || index === 5) {
            return (parseFloat(coord) * scaleX).toFixed(2)
          } else if (index === 1 || index === 6) {
            return (parseFloat(coord) * scaleY).toFixed(2)
          } else {
            return coord;
          }
        }
        if (type.toUpperCase() === 'Z') {
          return coord;
        }
        // 处理坐标
        if (index % 2 === 0) { // x 坐标
          return (parseFloat(coord) * scaleX).toFixed(2);
        } else { // y 坐标
          return (parseFloat(coord) * scaleY).toFixed(2);
        }
      });

      return type + transformedCoords.join(' '); // 重新组合成命令
    });

    return transformedCommands.join(' '); // 返回变换后的路径字符串
  }

  render(_board: Board, { element }: { element: GeometryElement }) {
    const {
      id,
      width,
      height,
      x,
      y,
      paths,
      fillOpacity,
      fill = 'transparent',
      stroke = 'black',
      strokeWidth = 2
    } = element;

    return (
      <svg style={{ overflow: "visible" }} key={id} x={x} y={y} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {
          paths.map((path) => {
            // 提取 path 中的所有坐标，分别乘以 width 和 height
            const pathString = this.transformPath(path, width, height);
            return <path key={path} d={pathString} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
          })
        }
      </svg>
    )
  }
}

export default GeometryPlugin;
