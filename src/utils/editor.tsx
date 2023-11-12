import { Descendant } from "slate";
import { ParagraphElement } from "@/components/Editor/types";
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
