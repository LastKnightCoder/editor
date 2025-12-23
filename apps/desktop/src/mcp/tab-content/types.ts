import type { ITab, TabType, TabParams } from "@/types/tab";

/**
 * Tab 内容元数据
 */
export interface TabContentMetadata {
  id: string;
  type: TabType;
  title: string;
  params?: any;
  closable?: boolean;
  groupId?: string;
  paneId?: string;
  isActive?: boolean;
}

/**
 * Tab 内容响应 - 混合格式
 */
export interface TabContentResponse<T = any> {
  metadata: TabContentMetadata;
  content: T; // string (Markdown) 或 object (列表数据)
  contentType: "markdown" | "list" | "object";
  truncated?: boolean;
  originalLength?: number;
  totalLength?: number; // 内容总长度（字符数或项数）
  itemCount?: number; // 用于列表类型
  range?: { start: number; end: number }; // 实际返回的范围
}

/**
 * Tab 内容提供者接口
 */
export interface ITabContentProvider<T extends TabType = TabType> {
  /**
   * 提供者支持的 Tab 类型
   */
  readonly tabType: T;

  /**
   * 获取 Tab 内容
   * @param tab - Tab 对象
   * @param options - 可选配置
   */
  getContent(
    tab: ITab<T>,
    options?: TabContentOptions,
  ): Promise<TabContentResponse>;

  /**
   * 验证 Tab 参数是否有效
   * @param params - Tab 参数
   */
  validateParams(params?: TabParams[T]): boolean;
}

/**
 * Tab 内容获取选项
 */
export interface TabContentOptions {
  range?: [number, number]; // 内容范围 [start, end]
  itemRange?: [number, number]; // 列表项范围 [start, end]
  includeMetadata?: boolean; // 是否包含元数据（默认 true）
}

/**
 * Pane 内容响应
 */
export interface PaneContentResponse {
  paneId: string;
  activeTabId: string;
  tabCount: number;
  direction?: string;
  splitRatio?: number;
  groups?: Array<{
    id: string;
    title: string;
    color?: string;
    collapsed?: boolean;
  }>;
  tabs: Array<{
    id: string;
    type: TabType;
    title: string;
    isActive: boolean;
    hasParams: boolean;
  }>;
}
