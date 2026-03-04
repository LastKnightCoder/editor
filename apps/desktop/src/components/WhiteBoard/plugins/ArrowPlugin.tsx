import intersect from "path-intersection";
import { MoveRight, RotateCcw } from "lucide-react";
import {
  IBoardPlugin,
  ArrowElement,
  Board,
  Point,
  SelectArea,
  ContextMenuContext,
  PluginContextMenuItem,
  ECreateBoardElementType,
  IElementCapabilities,
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types";
import ArrowElementComponent from "../components/ArrowElementComponent";
import {
  ArrowUtil,
  BoardUtil,
  CanvasUtil,
  PointUtil,
  selectAreaToRect,
  PathUtil,
} from "../utils";

export class ArrowPlugin implements IBoardPlugin {
  name = "arrow";

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.None,
      },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: false,
      },
      movement: {
        behavior: MovementBehavior.FollowBinding,
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "indigo",
      },
      refLine: {
        participatesInRefLines: false,
      },
      connectable: {
        // 箭头本身不能被其他箭头连接
        connectable: false,
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「创建箭头」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-arrow",
        label: "箭头",
        icon: <MoveRight size={14} />,
        priority: 110,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.StraightArrow;
        },
      });
    }

    // 右键选中单个直线箭头 → 添加「恢复直线」菜单
    if (targetElements.length === 1) {
      const element = targetElements[0] as ArrowElement;
      if (
        element.type === "arrow" &&
        element.lineType === "straight" &&
        element.midPoint &&
        element.points.length === 2
      ) {
        // 检查 midPoint 是否在起点和终点的直线上
        const [start, end] = element.points;
        const isOnLine = ArrowUtil.isPointOnLine(
          start,
          end,
          element.midPoint,
          1,
        );

        // 只有当 midPoint 不在直线上时才显示"恢复直线"选项
        if (!isOnLine) {
          items.push({
            key: "reset-straight-line",
            label: "恢复直线",
            icon: <RotateCcw size={14} />,
            priority: 100,
            onSelect: (ctx: ContextMenuContext) => {
              const arrow = ctx.targetElements.find(
                (el) => el.type === "arrow",
              ) as ArrowElement;
              if (!arrow) return;

              const arrowPath = PathUtil.getPathByElement(ctx.board, arrow);
              if (!arrowPath) return;

              ctx.board.apply([
                {
                  type: "set_node",
                  path: arrowPath,
                  properties: { midPoint: arrow.midPoint },
                  newProperties: { midPoint: undefined },
                },
              ]);
            },
          });
        }
      }
    }

    return items;
  }

  private getArrowPaddingPath(points: Point[], padding: number) {
    const upperPoints = points.map((point) => ({
      x: point.x,
      y: point.y - padding,
    }));
    const lowerPoints = points
      .map((point) => ({
        x: point.x,
        y: point.y + padding,
      }))
      .reverse();

    const leftPoints = points.map((point) => ({
      x: point.x - padding,
      y: point.y,
    }));
    const rightPoints = points
      .map((point) => ({
        x: point.x + padding,
        y: point.y,
      }))
      .reverse();

    return {
      upperPoints,
      lowerPoints,
      leftPoints,
      rightPoints,
    };
  }

  private generateSvgPathFromPoints(points: Point[], isClose = false) {
    if (points.length === 0) return "";
    let path = "";
    const start = points[0];
    path += `M${start.x},${start.y}`;

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      path += ` L${point.x},${point.y}`;
    }
    if (isClose) {
      path += " Z";
    }
    return path;
  }

  isHit(_board: Board, element: ArrowElement, x: number, y: number) {
    const {
      points,
      lineType,
      lineWidth,
      source: { marker: sourceMarker },
      target: { marker: targetMarker },
      midPoint,
    } = element;

    const path = ArrowUtil.getArrowPath({
      points,
      lineType,
      sourceMarker,
      targetMarker,
      midPoint,
    });

    if (path) {
      // 创建路径，判断 isPointInStroke
      return CanvasUtil.isPointInStroke(
        new Path2D(path),
        Math.max(lineWidth, 10),
        x,
        y,
      );
    }

    return false;
  }

  onDblClick(event: MouseEvent, board: Board) {
    const point = PointUtil.screenToViewPort(
      board,
      event.clientX,
      event.clientY,
    );
    if (!point) return;

    const hitElements = BoardUtil.getHitElements(board, point.x, point.y);
    const topElement = hitElements[hitElements.length - 1];
    if (!topElement || topElement.type !== "arrow") return;

    board.emit("arrow:description:edit", { id: topElement.id });
    return false;
  }

  moveElement(_board: Board, element: ArrowElement, dx: number, dy: number) {
    const { source, target, midPoint } = element;
    if (source.bindId || target.bindId) return null;

    return {
      ...element,
      points: element.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      })),
      ...(midPoint && {
        midPoint: {
          x: midPoint.x + dx,
          y: midPoint.y + dy,
        },
      }),
    };
  }

  getBounds(_board: Board, element: ArrowElement) {
    const { points } = element;
    if (!points || points.length === 0) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
      };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });

    return { minX, minY, maxX, maxY };
  }

  isElementSelected(
    board: Board,
    element: ArrowElement,
    selectArea: SelectArea | null = board.selection.selectArea,
  ) {
    if (!selectArea) return false;
    const { points } = element;
    const { x, y, width, height } = selectAreaToRect(selectArea);
    const { upperPoints, lowerPoints, leftPoints, rightPoints } =
      this.getArrowPaddingPath(points, 10);

    const yPath = this.generateSvgPathFromPoints(
      upperPoints.concat(lowerPoints),
      true,
    );
    const xPath = this.generateSvgPathFromPoints(
      leftPoints.concat(rightPoints),
      true,
    );
    const selectPath = this.generateSvgPathFromPoints(
      [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      true,
    );

    return (
      intersect(xPath, selectPath).length > 0 ||
      intersect(yPath, selectPath).length > 0 ||
      points.some((point) =>
        CanvasUtil.isPointInPath(new Path2D(selectPath), point.x, point.y),
      )
    );
  }

  render(_board: Board, { element }: { element: ArrowElement }) {
    return <ArrowElementComponent key={element.id} element={element} />;
  }
}
