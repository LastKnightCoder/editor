import React from "react";
/**
 * 标签页定义接口
 */
export interface TabDefinition {
  type: string; // 标签页类型
  icon: React.ReactNode; // 标签页图标
  title: string; // 标签页标题
  viewer: React.ComponentType<any>; // 标签页组件
}

/**
 * 标签页注册表类
 */
class TabRegistry {
  private registry = new Map<string, TabDefinition>();

  /**
   * 注册标签页
   */
  register(tabDefinition: TabDefinition): void {
    this.registry.set(tabDefinition.type, tabDefinition);
  }

  /**
   * 获取标签页定义
   */
  getTabDefinition(type: string): TabDefinition | undefined {
    return this.registry.get(type);
  }

  /**
   * 获取所有标签页定义
   */
  getAllTabDefinitions(): TabDefinition[] {
    return Array.from(this.registry.values());
  }
}

/**
 * 标签页注册表单例
 */
export const tabRegistry = new TabRegistry();

/**
 * 注册标签页便捷方法
 */
export function registerTab(tabDefinition: TabDefinition): void {
  tabRegistry.register(tabDefinition);
}

export default tabRegistry;
