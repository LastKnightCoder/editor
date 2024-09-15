import { BlockElement } from '../custom-element.ts';

export interface BlockquoteElement {
  type: 'blockquote';
  children: BlockElement[];
}