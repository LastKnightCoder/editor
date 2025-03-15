import React from "react";
import { GeometryElement } from "../../plugins";
import DefaultRenderer from "./renderers/DefaultRenderer";

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
  private renderers: Map<string, GeometryRenderer[]> = new Map();
  private priorities: Map<string, number[]> = new Map();

  // 注册渲染器
  register = (info: GeometryRendererInfo): void => {
    const { geometryType, renderer, priority = 0 } = info;

    // 获取当前类型的渲染器列表，如果不存在则创建新列表
    if (!this.renderers.has(geometryType)) {
      this.renderers.set(geometryType, []);
      this.priorities.set(geometryType, []);
    }

    // 添加渲染器和优先级
    const renderers = this.renderers.get(geometryType)!;
    const priorities = this.priorities.get(geometryType)!;

    if (renderers.includes(renderer)) {
      return;
    }

    renderers.push(renderer);
    priorities.push(priority);

    // 根据优先级排序
    const indices = Array.from({ length: renderers.length }, (_, i) => i);
    indices.sort((a, b) => priorities[b] - priorities[a]);

    // 重新排序渲染器和优先级
    this.renderers.set(
      geometryType,
      indices.map((i) => renderers[i]),
    );
    this.priorities.set(
      geometryType,
      indices.map((i) => priorities[i]),
    );
  };

  // 获取渲染器
  getSpecificRenderer = (geometryType: string): GeometryRenderer | null => {
    // 首先检查是否有特定类型的渲染器
    const renderers = this.renderers.get(geometryType);
    if (renderers && renderers.length > 0) {
      return renderers[0];
    }

    return null;
  };

  // 渲染几何图形
  renderGeometry = (props: GeometryRendererProps): React.ReactNode => {
    const { element } = props;

    // 首先尝试使用通用渲染器（可能包含草图风格等特殊渲染器）
    const universalRenderers = this.renderers.get("*");
    if (universalRenderers) {
      for (const renderer of universalRenderers) {
        const result = renderer(props);
        console.log("renderer", renderer.name, result);
        if (result) {
          return result;
        }
      }
    }

    // 然后尝试使用特定类型的渲染器
    const specificRenderer = this.getSpecificRenderer(element.geometryType);
    if (specificRenderer) {
      const result = specificRenderer(props);
      if (result) {
        return result;
      }
    }

    // 默认渲染方式：使用 SVG path
    return <DefaultRenderer {...props} />;
  };
}

// 创建单例实例
export const geometryRendererRegistry = new GeometryRendererRegistry();
