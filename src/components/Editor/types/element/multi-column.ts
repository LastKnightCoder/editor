import { BlockElement } from '../custom-element.ts';

export interface MultiColumnContainerElement {
  type:'multi-column-container';
  children: MultiColumnItemElement[];
}

export interface MultiColumnItemElement {
  type:'multi-column-item';
  width?: number;
  children: BlockElement[];
}