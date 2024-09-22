import Board from "@/pages/WhiteBoard/Board.ts";
import { BOARD_TO_CONTAINER } from "@/pages/WhiteBoard/constants/map.ts";

export class PointUtil {
  static screenToViewPort(board: Board, x: number, y: number) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return null;
    const { viewPort } = board;
    const { x: containerX, y: containerY } = container.getBoundingClientRect();
    const offsetX = x - containerX;
    const offsetY = y - containerY;
    const { minX, minY, zoom } = viewPort;

    return {
      x: offsetX / zoom + minX,
      y: offsetY / zoom + minY
    }
  }
}

export default PointUtil;
