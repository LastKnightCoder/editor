import { BlockElement } from '../custom-element.ts';

export interface ITabsContent {
  key: string;
  title: string;
  content: BlockElement[];
}

export interface TabsElement {
  type: 'tabs';
  activeKey: string;
  tabsContent: ITabsContent[];
  children: BlockElement[];
}