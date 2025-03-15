import React from "react";
import { GeometryElement } from "../../plugins";

// 设置器组件的接口
export interface GeometrySetterComponentProps {
  element: GeometryElement;
  onChange: (element: GeometryElement) => void;
}

// 设置器注册信息
interface GeometrySetterInfo {
  geometryType: string;
  component: React.ComponentType<GeometrySetterComponentProps>;
  priority?: number; // 优先级，用于排序
}

// 设置器注册表
class GeometrySetterRegistry {
  private setters: GeometrySetterInfo[] = [];

  // 注册设置器
  register(info: GeometrySetterInfo): void {
    // 检查是否已存在相同类型的设置器
    const existingIndex = this.setters.findIndex(
      (setter) => setter.geometryType === info.geometryType,
    );

    if (existingIndex >= 0) {
      // 替换已存在的设置器
      this.setters[existingIndex] = info;
    } else {
      // 添加新设置器
      this.setters.push(info);
    }

    // 按优先级排序
    this.setters.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // 获取特定几何类型的设置器
  getSetterComponent(
    geometryType: string,
  ): React.ComponentType<GeometrySetterComponentProps> | null {
    const setter = this.setters.find((s) => s.geometryType === geometryType);
    return setter ? setter.component : null;
  }

  // 获取所有已注册的设置器
  getAllSetters(): GeometrySetterInfo[] {
    return [...this.setters];
  }

  // 获取适用于给定元素的所有设置器组件
  getSettersForElement(
    element: GeometryElement,
  ): React.ComponentType<GeometrySetterComponentProps>[] {
    const components: React.ComponentType<GeometrySetterComponentProps>[] = [];

    // 添加特定几何类型的设置器
    const specificSetter = this.getSetterComponent(element.geometryType);
    if (specificSetter) {
      components.push(specificSetter);
    }

    return components;
  }
}

// 创建单例实例
export const geometrySetterRegistry = new GeometrySetterRegistry();

// 设置器容器组件
export const GeometryExtraSetters: React.FC<GeometrySetterComponentProps> = (
  props,
) => {
  const { element } = props;
  const setterComponents = geometrySetterRegistry.getSettersForElement(element);

  if (setterComponents.length === 0) {
    return null;
  }

  return (
    <>
      {setterComponents.map((Component, index) => (
        <Component key={`${element.geometryType}-setter-${index}`} {...props} />
      ))}
    </>
  );
};
