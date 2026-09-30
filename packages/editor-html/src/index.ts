import type {} from "./augmentations";
import htmlBlockExtension from "./extensions/html-block";
import htmlInlineExtension from "./extensions/html-inline";

export { htmlBlockExtension, htmlInlineExtension };
export type { HTMLBlockElement, HTMLInlineElement } from "./types";
export { insertHTMLBlock, insertInlineHtml, insertInlineHtmlElement } from "./insert";
export const htmlExtensions = [htmlBlockExtension, htmlInlineExtension] as const;
