import { Descendant } from "slate";
import { FormattedText, InlineElement } from "@tau/editor";

export const getEditorText = (value: Descendant[], maxLength = 20): string => {
  if (value.length === 0) {
    return "";
  }

  // 深度遍历，找到所有的 formatted 节点
  const formattedNodes: Array<FormattedText> = [];
  const traverse = (node: Descendant) => {
    if (node.type === "formatted") {
      formattedNodes.push(node);
      return;
    }
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        traverse(child);
      });
    }
  };

  value.forEach(node => {
    traverse(node);
  });

  if (formattedNodes.length === 0) {
    return "空卡片";
  }

  // 按照顺序拼接
  return formattedNodes
    .map(node => node.text)
    .join("")
    .slice(0, maxLength);
};

export const getInlineElementText = (element: InlineElement | FormattedText): string => {
  if ("html" in element && typeof element.html === "string") return element.html;
  switch (element.type) {
    case "formatted":
      return element.text;
    case "link":
      return element.children?.[0].text;
    case "inline-math":
      return element.tex;
    case "underline":
      return element.children?.[0].text;
    case "styled-text":
      return element.children?.[0].text;
    case "kbd":
      return element.children?.[0].text;
    case "inline-image":
      return element.alt || "[Image]";
    default:
      // const _exhaustiveCheck: never = element;
      // console.log(_exhaustiveCheck);
      return "";
  }
};
