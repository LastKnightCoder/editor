import {Descendant} from "slate";
import {DetailElement, ParagraphElement} from "@/components/Editor/types";
import {Typography} from "antd";
import Katex from "@/components/Katex";

export const getEditorTextValue = (value: Descendant[]) => {
  if (value.length === 0) {
    return '';
  }

  // 找到第一个段落，返回其文本内容
  const firstParagraph = value.find(node => node.type === 'paragraph');
  if (firstParagraph) {
    return getParagraphContent(firstParagraph as ParagraphElement);
  }

  const detail = value.find(node => node.type === 'detail');
  if (detail) {
    const paragraph = (detail as DetailElement).children.find(node => node.type === 'paragraph');
    if (paragraph) {
      return getParagraphContent(paragraph as ParagraphElement);
    }
  }

  return `【${value[0].type}】`;
}

const getParagraphContent = (paragraph: ParagraphElement) => {
  return paragraph.children.map((node, index) => {
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
    if (node.type === 'link') {
      return (
        <Typography.Link key={index}>
          {node.children?.[0].text}
        </Typography.Link>
      );
    }
    if (node.type === 'inline-math') {
      return (
        <Katex tex={node.tex} key={index} inline />
      )
    }
  });
}

export const getOutline = (value: Descendant[]) => {
  return value.filter(node => node.type === 'header');
}