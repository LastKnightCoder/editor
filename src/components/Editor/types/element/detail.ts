import { BlockElement } from '../custom-element.ts';

export interface DetailElement {
  type: 'detail';
  title: string;
  open?: boolean;
  children: BlockElement[];
}