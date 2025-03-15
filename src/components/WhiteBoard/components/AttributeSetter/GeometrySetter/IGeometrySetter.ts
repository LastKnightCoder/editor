import React from "react";
import { GeometryElement } from "../../../plugins";

/**
 * 几何图形设置器组件的接口
 */
export interface GeometrySetterComponentProps {
  element: GeometryElement;
  onChange: (element: GeometryElement) => void;
}

/**
 * 几何图形设置器接口
 */
export interface IGeometrySetter {
  /**
   * 获取设置器ID
   */
  getId(): string;

  /**
   * 获取设置器名称
   */
  getName(): string;

  /**
   * 获取设置器图标
   */
  getIcon(): React.ReactNode;

  /**
   * 获取设置器优先级
   */
  getPriority(): number;

  /**
   * 检查是否可以处理指定类型的几何图形
   * @param geometryType 几何图形类型
   */
  canHandle(geometryType: string): boolean;

  /**
   * 获取设置器组件
   */
  getComponent(): React.ComponentType<GeometrySetterComponentProps>;
}
