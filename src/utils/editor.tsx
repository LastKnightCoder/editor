import { Descendant } from "slate";
import {FormattedText, ParagraphElement} from "@/components/Editor/types";
import { Typography } from "antd";
import Katex from "@/components/Katex";

export const getEditorTextValue = (value: Descendant[]): JSX.Element[] | undefined => {
  if (value.length === 0) {
    return;
  }

  for (const child of value) {
    if (child.type === 'paragraph') {
      return getParagraphContent(child as ParagraphElement);
    }
    // @ts-ignore
    if (child.children && child.children.length > 0) {
      // @ts-ignore
      const str = getEditorTextValue(child.children);
      if (str) {
        return str;
      }
    }
  }

  return;
}

const getParagraphContent = (paragraph: ParagraphElement): Array<JSX.Element> => {
  return paragraph.children.map((node, index) => {
    switch(node.type) {
      case "formatted":
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
      case "link":
        return (
          <Typography.Link key={index}>
            {node.children?.[0].text}
          </Typography.Link>
        );
      case "inline-math":
        return (
          <Katex tex={node.tex} key={index} inline />
        )
    }
  }).filter(Boolean);
}

export const getEditorText = (value: Descendant[], maxLength = 20): string => {
  if (value.length === 0) {
    return '';
  }

  // 深度遍历，找到所有的 formatted 节点
  const formattedNodes: Array<FormattedText> = [];
  const traverse = (node: Descendant) => {
    if (node.type === 'formatted') {
      formattedNodes.push(node);
      return;
    }
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        traverse(child);
      })
    }
  }

  value.forEach(node => {
    traverse(node);
  });

  if (formattedNodes.length === 0) {
    return '空卡片';
  }

  // 按照顺序拼接
  return formattedNodes.map(node => node.text).join('').slice(0, maxLength);
}
