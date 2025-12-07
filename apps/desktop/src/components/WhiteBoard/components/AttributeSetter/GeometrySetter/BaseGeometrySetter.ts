import {
  IGeometrySetter,
  GeometrySetterComponentProps,
} from "./IGeometrySetter";
import React from "react";

/**
 * 基础几何图形设置器抽象类
 */
export abstract class BaseGeometrySetter implements IGeometrySetter {
  protected readonly geometryTypes: string[];
  protected readonly priority: number;
  protected readonly id: string;
  protected readonly name: string;

  /**
   * 构造函数
   * @param id 设置器ID
   * @param name 设置器名称
   * @param geometryTypes 支持的几何图形类型数组
   * @param priority 优先级，数值越大优先级越高
   */
  constructor(
    id: string,
    name: string,
    geometryTypes: string[],
    priority = 10,
  ) {
    this.id = id;
    this.name = name;
    this.geometryTypes = geometryTypes;
    this.priority = priority;
  }

  /**
   * 获取设置器ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * 获取设置器名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 获取设置器图标
   */
  abstract getIcon(): React.ReactNode;

  /**
   * 判断当前设置器是否可以处理指定的几何图形
   * @param geometryType 几何图形类型
   */
  canHandle(geometryType: string): boolean {
    return (
      this.geometryTypes.includes(geometryType) ||
      this.geometryTypes.includes("*")
    );
  }

  /**
   * 获取设置器优先级
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * 获取设置器组件（抽象方法，需要子类实现）
   */
  abstract getComponent(): React.ComponentType<GeometrySetterComponentProps>;
}
