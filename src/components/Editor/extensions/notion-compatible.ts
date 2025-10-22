/**
 * Notion 兼容的编辑器扩展集
 *
 * 只包含可以和 Notion 格式互相转换的扩展
 * 用于双向编辑模式
 */

import {
  paragraph,
  header,
  bulletedList,
  numberedList,
  listItem,
  codeBlock,
  blockquote,
  link,
  inlineMath,
  blockMath,
  image,
  divideLine,
  styledText,
  underline,
} from "./index";

export const notionCompatibleExtensions = [
  paragraph,
  header,
  bulletedList,
  numberedList,
  listItem,
  codeBlock,
  blockquote,
  link,
  inlineMath,
  blockMath,
  image,
  divideLine,
  styledText,
  underline,
];
