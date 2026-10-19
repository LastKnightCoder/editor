import type { BlockElement } from "@tau/editor/api";

/**
 * 旧数据形态：Tab 内容整体存于 tabs 属性中，仅作存量数据读取兼容，
 * 由迁移逻辑转换为 tab-pane 子节点后不再产生。
 */
export interface ITabsContent {
  key: string;
  title: string;
  content: BlockElement[];
}

/** 单个 Tab 容器节点：Tab 的真实内容作为其 children 留在文档树内 */
export interface TabPaneElement {
  type: "tab-pane";
  tabKey: string;
  title: string;
  children: BlockElement[];
}

export interface TabsElement {
  type: "tabs";
  activeKey: string;
  /** @deprecated 旧数据形态，仅迁移读取兼容 */
  tabsContent?: ITabsContent[];
  children: TabPaneElement[];
}

export interface ITabItem {
  key: string;
  title: string;
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
