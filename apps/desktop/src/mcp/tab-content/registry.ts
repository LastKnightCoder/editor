import type { TabType } from "@/types/tab";
import type { ITabContentProvider } from "./types";

/**
 * Tab 内容提供者注册表
 */
class TabContentProviderRegistry {
  private providers: Map<TabType, ITabContentProvider> = new Map();

  /**
   * 注册提供者
   */
  register<T extends TabType>(provider: ITabContentProvider<T>): void {
    if (this.providers.has(provider.tabType)) {
      console.warn(
        `Provider for tab type "${provider.tabType}" already registered. Overwriting.`,
      );
    }
    this.providers.set(provider.tabType, provider);
  }

  /**
   * 批量注册提供者
   */
  registerMultiple(providers: ITabContentProvider[]): void {
    providers.forEach((provider) => this.register(provider));
  }

  /**
   * 获取提供者
   */
  getProvider<T extends TabType>(tabType: T): ITabContentProvider<T> | null {
    return (this.providers.get(tabType) as ITabContentProvider<T>) || null;
  }

  /**
   * 检查是否已注册
   */
  hasProvider(tabType: TabType): boolean {
    return this.providers.has(tabType);
  }

  /**
   * 获取所有已注册的 Tab 类型
   */
  getRegisteredTypes(): TabType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 清除所有注册
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * 获取提供者数量
   */
  get size(): number {
    return this.providers.size;
  }
}

// 单例实例
export const tabContentRegistry = new TabContentProviderRegistry();
