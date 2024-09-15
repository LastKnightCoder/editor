import { BlockElement } from '../custom-element.ts';

export type Color = 'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'purple';

export interface HighlightBlockElement {
  type: 'highlight-block',
  children: BlockElement[];
  color: Color;
}