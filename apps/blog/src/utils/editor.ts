import type { InlineElement, FormattedText } from '@tau/editor';

export const getInlineElementText = (
  element: InlineElement | FormattedText,
): string => {
  switch (element.type) {
    case 'formatted':
      return element.text;
    case 'link':
    case 'underline':
    case 'styled-text':
      return element.children?.[0]?.text ?? '';
    case 'inline-math':
      return element.tex;
    case 'html-inline':
      return element.html ?? '';
    case 'inline-image':
      return element.alt ?? '[Image]';
    default:
      return '';
  }
};
