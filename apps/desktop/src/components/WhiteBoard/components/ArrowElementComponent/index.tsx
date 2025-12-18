import If from "@/components/If";
import { useEffect, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { useSelectState, useBoard } from "../../hooks";
import { ArrowElement, BoardElement, Operation, Point } from "../../types";
import Arrow from "../Arrow";
import ArrowActivePoint from "./ArrowActivePoint";
import ArrowMidPointHandle from "./ArrowMidPointHandle";
import { PathUtil } from "../../utils";
import { getArrowDisplayColor } from "../../utils/color";
import useTheme from "@/hooks/useTheme";

interface ArrowElementProps {
  element: ArrowElement;
}

const ArrowElementComponent = memo((props: ArrowElementProps) => {
  const { element } = props;
  const {
    points,
    lineWidth,
    lineType,
    source,
    target,
    sketchEnabled,
    roughness,
    dashed,
    dashArray,
    animated,
    animationSpeed,
    midPoint,
  } = element;

  const board = useBoard();
  const { isSelected } = useSelectState(element.id);
  const { isDark } = useTheme();

  // 获取实际显示的颜色（根据颜色模式和当前主题）
  const displayColor = getArrowDisplayColor(element, isDark);

  const handleElementsRemove = useMemoizedFn((elements: BoardElement[]) => {
    const sourceBindElement = elements.find(
      (element) => element.id === source?.bindId,
    );
    const targetBindElement = elements.find(
      (element) => element.id === target?.bindId,
    );

    if (sourceBindElement || targetBindElement) {
      const newElement = {
        ...element,
        source: sourceBindElement
          ? { marker: element.source.marker }
          : element.source,
        target: targetBindElement
          ? { marker: element.target.marker }
          : element.target,
      };
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const op: Operation = {
        type: "set_node",
        path,
        properties: element,
        newProperties: newElement,
      };

      board.apply(op);
    }
  });

  const handleElementsChange = useMemoizedFn((elements: BoardElement[]) => {
    const sourceBindElement = elements.find(
      (element) => element.id === source?.bindId,
    );
    const targetBindElement = elements.find(
      (element) => element.id === target?.bindId,
    );

    let sourcePoint: Point | null = null;
    let targetPoint: Point | null = null;

    if (sourceBindElement) {
      const { connectId } = source;
      const sourceBindPoint = board.getArrowBindPoint(
        sourceBindElement,
        connectId!,
      );
      if (sourceBindPoint) {
        sourcePoint = sourceBindPoint;
      }
    }

    if (targetBindElement) {
      const { connectId } = target;
      const targetBindPoint = board.getArrowBindPoint(
        targetBindElement,
        connectId!,
      );
      if (targetBindPoint) {
        targetPoint = targetBindPoint;
      }
    }

    const newPoints = [...points];
    if (sourcePoint) {
      newPoints[0] = sourcePoint;
    }

    if (targetPoint) {
      newPoints[newPoints.length - 1] = targetPoint;
    }

    if (sourcePoint || targetPoint) {
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const newElement = {
        ...element,
        points: newPoints,
      };
      board.apply(
        [
          {
            type: "set_node",
            path,
            properties: element,
            newProperties: newElement,
          },
        ],
        false,
      );
    }
  });

  useEffect(() => {
    board.on("element:change", handleElementsChange);
    board.on("element:remove", handleElementsRemove);
    return () => {
      board.off("element:change", handleElementsChange);
      board.off("element:remove", handleElementsRemove);
    };
  }, [board, handleElementsChange, handleElementsRemove]);

  return (
    <g>
      <Arrow
        points={points}
        lineColor={displayColor}
        lineWidth={lineWidth}
        lineType={lineType}
        sourceMarker={source.marker}
        targetMarker={target.marker}
        sourceConnectId={source.connectId}
        targetConnectId={target.connectId}
        sketchEnabled={sketchEnabled}
        roughness={roughness}
        dashed={dashed}
        dashArray={dashArray}
        animated={animated}
        animationSpeed={animationSpeed}
        midPoint={midPoint}
      />
      <If condition={isSelected}>
        {points.map((point, index) => (
          <ArrowActivePoint
            key={index}
            arrowElement={element}
            point={point}
            outerFill={displayColor}
            index={index}
          />
        ))}
        {/* 中间点手柄（仅对 STRAIGHT 类型的两点直线显示） */}
        <ArrowMidPointHandle arrowElement={element} />
      </If>
    </g>
  );
});

export default ArrowElementComponent;
