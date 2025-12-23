import type { ITab, TabType, TabParams } from "@/types/tab";
import type {
  ITabContentProvider,
  TabContentResponse,
  TabContentOptions,
  TabContentMetadata,
} from "../types";

/**
 * Tab 内容提供者基类
 */
export abstract class BaseTabContentProvider<
  T extends TabType = TabType,
> implements ITabContentProvider<T> {
  abstract readonly tabType: T;

  /**
   * 获取 Tab 内容（子类必须实现）
   */
  abstract getContent(
    tab: ITab<T>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse>;

  /**
   * 验证参数（子类可覆盖）
   */
  validateParams(_params?: TabParams[T]): boolean {
    // 默认实现：无参数类型总是有效
    return true;
  }

  /**
   * 构建元数据
   */
  protected buildMetadata(
    tab: ITab<T>,
    paneId?: string,
    isActive?: boolean,
  ): TabContentMetadata {
    return {
      id: tab.id,
      type: tab.type,
      title: tab.title,
      params: tab.params,
      closable: tab.closable,
      groupId: tab.groupId,
      paneId,
      isActive,
    };
  }

  /**
   * 截断内容（支持范围）
   */
  protected truncateContent(
    content: string,
    range?: [number, number],
  ): {
    content: string;
    truncated: boolean;
    originalLength: number;
    totalLength: number;
    range?: { start: number; end: number };
  } {
    const totalLength = content.length;

    // 使用 range 参数
    if (range) {
      const [start, end] = range;
      const actualStart = Math.max(0, Math.min(start, totalLength));
      const actualEnd = Math.max(actualStart, Math.min(end, totalLength));

      return {
        content: content.substring(actualStart, actualEnd),
        truncated: actualStart > 0 || actualEnd < totalLength,
        originalLength: actualEnd - actualStart,
        totalLength,
        range: { start: actualStart, end: actualEnd },
      };
    }

    // 返回完整内容
    return {
      content,
      truncated: false,
      originalLength: totalLength,
      totalLength,
    };
  }

  /**
   * 限制列表项数（支持范围）
   */
  protected limitItems<I>(
    items: I[],
    itemRange?: [number, number],
  ): {
    items: I[];
    truncated: boolean;
    originalCount: number;
    totalCount: number;
    range?: { start: number; end: number };
  } {
    const totalCount = items.length;

    // 使用 itemRange 参数
    if (itemRange) {
      const [start, end] = itemRange;
      const actualStart = Math.max(0, Math.min(start, totalCount));
      const actualEnd = Math.max(actualStart, Math.min(end, totalCount));

      return {
        items: items.slice(actualStart, actualEnd),
        truncated: actualStart > 0 || actualEnd < totalCount,
        originalCount: actualEnd - actualStart,
        totalCount,
        range: { start: actualStart, end: actualEnd },
      };
    }

    // 返回完整列表
    return {
      items,
      truncated: false,
      originalCount: totalCount,
      totalCount,
    };
  }
}
