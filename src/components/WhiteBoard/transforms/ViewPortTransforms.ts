import { ViewPort, Board, BoardElement } from "../types";
import { BOARD_TO_CONTAINER } from "../constants/map.ts";

export class ViewPortTransforms {
  static updateZoom(board: Board, newZoom: number, point?: [number, number]) {
    const originViewPort = board.viewPort;
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;
    const newViewport = this.getNewViewport(
      originViewPort,
      container,
      newZoom,
      point,
    );
    board.apply(
      {
        type: "set_viewport",
        properties: originViewPort,
        newProperties: newViewport,
      },
      false,
    );
  }

  static onContainerResize(board: Board) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;
    const newViewport = this.getNewViewport(
      board.viewPort,
      container,
      board.viewPort.zoom,
    );
    board.apply(
      {
        type: "set_viewport",
        properties: board.viewPort,
        newProperties: newViewport,
      },
      false,
    );
  }

  static moveViewPort(board: Board, minX: number, minY: number) {
    board.apply(
      {
        type: "set_viewport",
        properties: board.viewPort,
        newProperties: {
          minX,
          minY,
        },
      },
      false,
    );
  }

  static fitAllElements(
    board: Board,
    padding = 50,
    animate = true,
    elements?: BoardElement[],
  ) {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container) return;

    // 使用指定的元素或所有元素
    const targetElements = elements || board.children;

    if (targetElements.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    targetElements.forEach((element) => {
      if (
        "x" in element &&
        "y" in element &&
        "width" in element &&
        "height" in element
      ) {
        const { x, y, width, height } = element;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      }

      if (element.type === "arrow" && element.points) {
        element.points.forEach((point: { x: number; y: number }) => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
      }
    });

    // 如果没有找到有效的边界，则返回
    if (
      minX === Infinity ||
      minY === Infinity ||
      maxX === -Infinity ||
      maxY === -Infinity
    ) {
      console.log("未找到有效边界，退出全览");
      return;
    }

    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const elementsWidth = maxX - minX;
    const elementsHeight = maxY - minY;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / elementsWidth;
    const scaleY = containerHeight / elementsHeight;
    const zoom = Math.min(scaleX, scaleY);

    const newViewport = {
      zoom,
      width: containerWidth / zoom,
      height: containerHeight / zoom,
      minX: minX - (containerWidth / zoom - elementsWidth) / 2,
      minY: minY - (containerHeight / zoom - elementsHeight) / 2,
    };

    if (animate) {
      // 使用动画效果
      this.animateToViewport(board, board.viewPort, newViewport, 300);
    } else {
      // 直接应用新视图，无动画
      board.apply(
        {
          type: "set_viewport",
          properties: board.viewPort,
          newProperties: newViewport,
        },
        false,
      );
    }
  }

  /**
   * 从一个视图平滑过渡到另一个视图
   * @param board 白板实例
   * @param startViewport 起始视图
   * @param endViewport 目标视图
   * @param duration 动画持续时间（毫秒）
   * @param easeFunction 缓动函数，默认为缓出效果
   * @returns Promise，动画完成时解析
   */
  static animateToViewport(
    board: Board,
    startViewport: ViewPort,
    endViewport: ViewPort,
    duration = 500,
    easeFunction: (t: number) => number = (t) => 1 - Math.pow(1 - t, 3),
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const animateViewport = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // 使用缓动函数使动画更自然
        const easeProgress = easeFunction(progress);

        const currentViewport = {
          zoom:
            startViewport.zoom +
            (endViewport.zoom - startViewport.zoom) * easeProgress,
          width:
            startViewport.width +
            (endViewport.width - startViewport.width) * easeProgress,
          height:
            startViewport.height +
            (endViewport.height - startViewport.height) * easeProgress,
          minX:
            startViewport.minX +
            (endViewport.minX - startViewport.minX) * easeProgress,
          minY:
            startViewport.minY +
            (endViewport.minY - startViewport.minY) * easeProgress,
        };

        board.apply(
          {
            type: "set_viewport",
            properties: board.viewPort,
            newProperties: currentViewport,
          },
          false,
        );

        if (progress < 1) {
          requestAnimationFrame(animateViewport);
        } else {
          resolve();
        }
      };

      animateViewport();
    });
  }

  private static getNewViewport(
    originViewPort: ViewPort,
    container: HTMLDivElement,
    newZoom: number,
    point?: [number, number],
  ): ViewPort {
    const width = container.clientWidth;
    const height = container.clientHeight;

    point = point || [width / 2, height / 2];

    const { zoom, minX, minY } = originViewPort;

    return {
      zoom: newZoom,
      width: width / newZoom,
      height: height / newZoom,
      minX: point[0] * (1 / zoom - 1 / newZoom) + minX,
      minY: point[1] * (1 / zoom - 1 / newZoom) + minY,
    };
  }
}
