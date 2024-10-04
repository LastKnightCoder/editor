import { EventHandler, Board, SelectArea, BBox, Point, EHandlerPosition } from "../types";

// 判断两个矩形是否相交
export const isRectIntersect = (rect1: BBox, rect2: BBox) => {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect1.x > rect2.x + rect2.width ||
    rect1.y + rect1.height < rect2.y ||
    rect1.y > rect2.y + rect2.height
  );
}

export const selectAreaToRect = (selectArea: SelectArea) => {
  return {
    x: Math.min(selectArea.anchor.x, selectArea.focus.x),
    y: Math.min(selectArea.anchor.y, selectArea.focus.y),
    width: Math.abs(selectArea.anchor.x - selectArea.focus.x),
    height: Math.abs(selectArea.anchor.y - selectArea.focus.y)
  }
}

export const isValid = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export const executeSequence = (fns: EventHandler[], event: Event, board: Board) => {
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    const result = fn(event, board);
    if (result === false) return;
  }
}

export const getResizedBBox = (bbox: BBox, position: EHandlerPosition, anchor: Point, focus: Point, isPreserveRatio = false): BBox => {
  const { x: left, y: top, width, height } = bbox;
  const moveX = focus.x - anchor.x;
  const moveY = focus.y - anchor.y;
  let newX = left;
  let newY = top;
  let newWidth = width;
  let newHeight = height;
  const ratio = width / height;
  // 还需要考虑拖拽超出了另一边，比如拖拽左边，超出了右边，那么 x, y 和 width, height 的值需要调整
  if ([EHandlerPosition.Left, EHandlerPosition.BottomLeft, EHandlerPosition.TopLeft].includes(position)) {
    newX = left + moveX;
    newWidth = width - moveX;
    if (newWidth < 0) {
      newX = left + width;
      newWidth = moveX - width;
    }
  }
  if ([EHandlerPosition.Right, EHandlerPosition.BottomRight, EHandlerPosition.TopRight].includes(position)) {
    newWidth = width + moveX;
    if (newWidth < 0) {
      newWidth = Math.abs(width + moveX);
      newX = left + width + moveX;
    }
  }
  
  if ([EHandlerPosition.Top, EHandlerPosition.TopLeft, EHandlerPosition.TopRight].includes(position)) {
    newY = top + moveY;
    newHeight = height - moveY;
    if (newHeight < 0) {
      newY = top + height;
      newHeight = moveY - height;
    }
    if (isPreserveRatio) {
      newHeight = newWidth / ratio;
    }
  }
  if ([EHandlerPosition.Bottom, EHandlerPosition.BottomLeft, EHandlerPosition.BottomRight].includes(position)) {
    newHeight = height + moveY;
    if (newHeight < 0) {
      newHeight = Math.abs(moveY + height);
      newY = top + height + moveY;
    }
    if (isPreserveRatio) {
      newHeight = newWidth / ratio;
    }
  }

  if ([EHandlerPosition.Left, EHandlerPosition.Right].includes(position) && isPreserveRatio) {
    newHeight = newWidth / ratio;
  } else if ([EHandlerPosition.Bottom, EHandlerPosition.Top].includes(position) && isPreserveRatio) {
    newWidth = newHeight * ratio;
  }

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight
  }
}

export const transformPath = (pathString: string, scaleX: number, scaleY: number) => {
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