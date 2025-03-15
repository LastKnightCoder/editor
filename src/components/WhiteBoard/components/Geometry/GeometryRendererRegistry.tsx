import React from "react";
import { GeometryElement } from "../../plugins";
import { transformPath } from "../../utils";

// 渲染器接口
export interface GeometryRendererProps {
  element: GeometryElement;
  width: number;
  height: number;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

// 渲染器类型
export type GeometryRenderer = React.FC<GeometryRendererProps>;

// 渲染器注册信息
interface GeometryRendererInfo {
  geometryType: string;
  renderer: GeometryRenderer;
  priority?: number;
}

// 渲染器注册表
class GeometryRendererRegistry {
  private renderers: Map<string, GeometryRenderer> = new Map();

  // 注册渲染器
  register = (info: GeometryRendererInfo): void => {
    this.renderers.set(info.geometryType, info.renderer);
  };

  // 获取渲染器
  getRenderer = (geometryType: string): GeometryRenderer | null => {
    return this.renderers.get(geometryType) || null;
  };

  // 渲染几何图形
  renderGeometry = (props: GeometryRendererProps): React.ReactNode => {
    const { element } = props;
    const renderer = this.getRenderer(element.geometryType);

    if (renderer) {
      return renderer(props);
    }

    // 默认渲染方式：使用 SVG path
    return this.defaultRenderer(props);
  };

  // 默认渲染器
  defaultRenderer = ({
    element,
    width,
    height,
    fill,
    fillOpacity,
    stroke,
    strokeWidth,
    strokeOpacity,
  }: GeometryRendererProps): React.ReactNode => {
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
}

// 创建单例实例
export const geometryRendererRegistry = new GeometryRendererRegistry();
