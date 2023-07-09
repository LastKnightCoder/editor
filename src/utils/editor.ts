import {Descendant} from "slate";
import {ParagraphElement} from "@/pages/Editor/types";

export const getEditorTextValue = (value: Descendant[]) => {
  // 找到第一个段落，返回其文本内容
  const firstParagraph = value.find(node => node.type === 'paragraph');
  if (firstParagraph) {
    let text = '';
    (firstParagraph as ParagraphElement).children.forEach(node => {
      if (node.type === 'formatted') {
        text += node.text;
      }
    });
    return text;
  }
  if (value.length === 0) {
    return '';
  }
  return `【${value[0].type}】`;
}