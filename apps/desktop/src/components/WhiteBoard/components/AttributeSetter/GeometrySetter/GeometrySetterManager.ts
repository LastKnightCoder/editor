import {
  IGeometrySetter,
  GeometrySetterComponentProps,
} from "./IGeometrySetter";
import React from "react";
import { GeometryElement } from "../../../plugins";

/**
 * 几何图形设置器管理类
 * 负责管理和调度所有几何图形设置器
 */
export class GeometrySetterManager {
  private static instance: GeometrySetterManager;
  private setters: IGeometrySetter[] = [];

  /**
   * 私有构造函数，防止外部直接创建实例
   */
  private constructor() {
    // 空构造函数
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): GeometrySetterManager {
    if (!GeometrySetterManager.instance) {
      GeometrySetterManager.instance = new GeometrySetterManager();
    }
    return GeometrySetterManager.instance;
  }

  /**
   * 注册几何图形设置器
   * @param setter 几何图形设置器
   */
  public register(setter: IGeometrySetter): void {
    // 检查是否已存在相同ID的设置器
    const existingIndex = this.setters.findIndex(
      (s) => s.getId() === setter.getId(),
    );

    if (existingIndex >= 0) {
      // 替换已存在的设置器
      this.setters[existingIndex] = setter;
    } else {
      // 添加新设置器
      this.setters.push(setter);
    }

    // 按优先级排序，优先级高的排在前面
    this.setters.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * 获取适用于给定元素的所有设置器组件
   * @param element 几何图形元素
   */
  public getSettersForElement(
    element: GeometryElement,
  ): React.ComponentType<GeometrySetterComponentProps>[] {
    const components: React.ComponentType<GeometrySetterComponentProps>[] = [];

    // 查找可以处理当前几何图形的设置器
    for (const setter of this.setters) {
      if (setter.canHandle(element.geometryType)) {
        components.push(setter.getComponent());
      }
    }

    return components;
  }

  /**
   * 获取所有已注册的设置器
   */
  public getAllSetters(): IGeometrySetter[] {
    return [...this.setters];
  }

  /**
   * 根据ID获取设置器
   * @param id 设置器ID
   */
  public getSetterById(id: string): IGeometrySetter | undefined {
    return this.setters.find((setter) => setter.getId() === id);
  }
}

// 导出单例实例
export const geometrySetterManager = GeometrySetterManager.getInstance();
