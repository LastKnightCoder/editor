import { memo, useMemo } from "react";
import type { GeometryElement } from "../../plugins";
import type { ResolvedSketch } from "../../types";
import { transformPath } from "../../utils/common";
import { sketchShape, type SketchOutline } from "../../utils/sketch";
import SketchPaths from "../SketchPaths";

interface SketchGeometryProps {
  element: GeometryElement;
  width: number;
  height: number;
  sketch: ResolvedSketch;
}

/** 手绘模式下的几何图形：矩形 / 圆走精确轮廓，其余图形拆平配置里的 path */
const SketchGeometry = memo(({ element, width, height, sketch }: SketchGeometryProps) => {
  const { geometryType, paths, extraInfo, fill, fillOpacity, fillStyle } = element;
  const { stroke, strokeWidth = 1, strokeOpacity } = element;
  const cornerRadius = extraInfo?.cornerRadius ?? 0;
  const pathsKey = paths.join("|");

  const sketchPaths = useMemo(() => {
    const outline: SketchOutline =
      geometryType === "rectangle"
        ? { kind: "rect", cornerRadius }
        : geometryType === "circle"
          ? { kind: "ellipse" }
          : { kind: "path", paths: pathsKey.split("|").map(p => transformPath(p, width, height)) };
    return sketchShape({
      outline,
      width,
      height,
      stroke,
      strokeWidth,
      strokeOpacity,
      fill,
      fillOpacity,
      fillStyle,
      level: sketch.level,
      seed: sketch.seed,
    });
  }, [
    geometryType,
    cornerRadius,
    pathsKey,
    width,
    height,
    stroke,
    strokeWidth,
    strokeOpacity,
    fill,
    fillOpacity,
    fillStyle,
    sketch.level,
    sketch.seed,
  ]);

  return <SketchPaths paths={sketchPaths} />;
});

export default SketchGeometry;
