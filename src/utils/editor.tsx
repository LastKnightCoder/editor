import {Descendant} from "slate";
import { ParagraphElement} from "@/components/Editor/types";
import {Typography} from "antd";

export const getEditorTextValue = (value: Descendant[]) => {
  // 找到第一个段落，返回其文本内容
  const firstParagraph = value.find(node => node.type === 'paragraph');
  if (firstParagraph) {
    return (firstParagraph as ParagraphElement).children.map((node, index) => {
      if (node.type === 'formatted') {
        return (
          <Typography.Text
            key={index}
            code={node.code}
            strong={node.bold}
            underline={node.underline}
            italic={node.italic}
            delete={node.strikethrough}
          >
            {node.text}
          </Typography.Text>
        );
      }
    });
  }
  if (value.length === 0) {
    return '';
  }
  return `【${value[0].type}】`;
}

export const isEditorValueEmpty = (value: Descendant[]) => {
  if (value.length > 1) {
    return false;
  }
  if (value.length === 0) {
    return true;
  }
  const firstNode = value[0];
  if (firstNode.type === 'paragraph') {
    if ((firstNode as ParagraphElement).children.length === 0) {
      return true;
    }
    if (firstNode.children.length > 1) {
      return false;
    }
    const firstChild = firstNode.children[0];
    if (firstChild.type === 'formatted') {
      return firstChild.text === '';
    } else {
      return false;
    }
  }
  return false;
}

export const getOutline = (value: Descendant[]) => {
  return value.filter(node => node.type === 'header');
}