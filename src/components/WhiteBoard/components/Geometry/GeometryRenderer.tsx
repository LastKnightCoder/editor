import { memo } from "react";
import {
  GeometryRendererProps,
  geometryRendererRegistry,
} from "./GeometryRendererRegistry";

const GeometryRenderer = memo((props: GeometryRendererProps) => {
  const {
    element,
    width,
    height,
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    strokeOpacity,
  } = props;

  return (
    <>
      {geometryRendererRegistry.renderGeometry({
        element,
        width,
        height,
        fill,
        fillOpacity,
        stroke,
        strokeWidth,
        strokeOpacity,
      })}
    </>
  );
});

export default GeometryRenderer;
