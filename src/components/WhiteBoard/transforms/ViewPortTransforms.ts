import { ViewPort, Board } from '../types';
import { BOARD_TO_CONTAINER } from '../constants/map.ts';

export class ViewPortTransforms {
  static updateZoom(board: Board, newZoom: number, point?: [number, number]) {
    const originViewPort = board.viewPort
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;
    const newViewport = this.getNewViewport(originViewPort, container, newZoom, point);
    board.apply({
      type: 'set_viewport',
      properties: originViewPort,
      newProperties: newViewport
    }, false);
  }

  static onContainerResize(board: Board) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;
    const newViewport = this.getNewViewport(board.viewPort, container, board.viewPort.zoom);
    board.apply({
      type: 'set_viewport',
      properties: board.viewPort,
      newProperties: newViewport
    }, false);
  }

  static moveViewPort(board: Board, minX: number, minY: number) {
    board.apply({
      type: 'set_viewport',
      properties: board.viewPort,
      newProperties: {
        minX,
        minY,
      }
    }, false)
  }

  private static getNewViewport(originViewPort: ViewPort, container: HTMLDivElement, newZoom: number, point?: [number, number]): ViewPort {
    const width = container.clientWidth;
    const height = container.clientHeight;

    point = point || [width / 2, height / 2];

    const {
      zoom,
      minX,
      minY
    } = originViewPort;

    return {
      zoom: newZoom,
      width: width / newZoom,
      height: height / newZoom,
      minX: point[0] * (1 / zoom - 1 / newZoom) + minX,
      minY: point[1] * (1 / zoom - 1 / newZoom) + minY
    }
  }
}