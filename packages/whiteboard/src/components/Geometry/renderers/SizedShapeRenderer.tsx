import { GeometryRendererProps } from "../GeometryRendererRegistry";
import { isClosedPath, sizedShapePaths } from "../sizedShapes";

const SizedShapeRenderer: React.FC<GeometryRendererProps> = ({
  element,
  width,
  height,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeOpacity,
}) => {
  const paths = sizedShapePaths[element.geometryType]?.(width, height) ?? [];

  return (
    <>
      {paths.map((d, index) => (
        <path
          key={index}
          d={d}
          fill={isClosedPath(d) ? fill : "none"}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
      ))}
    </>
  );
};

export default SizedShapeRenderer;
