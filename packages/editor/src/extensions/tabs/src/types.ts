import type { BlockElement } from "@tau/editor/api";

/** 单个 Tab 容器节点：Tab 的真实内容作为其 children 留在文档树内 */
export interface TabPaneElement {
  type: "tab-pane";
  tabKey: string;
  title: string;
  children: BlockElement[];
}

export interface TabsElement {
  type: "tabs";
  activeKey?: string;
  children: TabPaneElement[];
}

export interface ITabItem {
  key: string;
  title: string;
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
