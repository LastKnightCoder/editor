import { Descendant } from "slate";

export const CREATE_CARD_ID = -1;

export const DEFAULT_CARD_CONTENT: Descendant[] = [{
  type: 'paragraph',
  children: [{ type: 'formatted', text: '' }],
}]