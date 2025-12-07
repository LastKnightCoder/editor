import { transformPath } from "@/components/WhiteBoard/utils/common";
import { GeometryRendererProps } from "../GeometryRendererRegistry";

const DefaultRenderer: React.FC<GeometryRendererProps> = ({
  element,
  width,
  height,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeOpacity,
}) => {
  const { paths } = element;

  return (
    <>
      {paths.map((path, index) => {
        // 使用项目中已有的 transformPath 函数
        const pathString = transformPath(path, width, height);
        return (
          <path
            key={`${path}-${index}`}
            d={pathString}
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        );
      })}
    </>
  );
};

export default DefaultRenderer;
