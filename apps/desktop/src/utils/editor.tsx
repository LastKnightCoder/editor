import { Descendant, Editor } from "slate";
import { FormattedText, ParagraphElement, InlineElement } from "@tau/editor";
import type { CodeBlockElement } from "@tau/editor-code-block/types";
import type { InlineMathElement, BlockMathElement } from "@tau/editor-math/types";
import classnames from "classnames";
import { Katex } from "@tau/editor-math/renderers";
import { wordsCount } from "words-count";
import { StyledTextColorStyle } from "@tau/editor-styled-text/colors";
import type { ReactElement } from "react";
import LocalImage from "@/components/LocalImage";

export const getEditorTextValue = (value: Descendant[]): ReactElement[] | undefined => {
  if (value.length === 0) {
    return;
  }

  for (const child of value) {
    if (child.type === "paragraph") {
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
};

const getParagraphContent = (paragraph: ParagraphElement): Array<ReactElement> => {
  return paragraph.children
    .map((node, index): ReactElement | undefined => {
      switch (node.type) {
        case "formatted":
          return (
            <span
              key={index}
              className={classnames({
                "font-mono": node.code,
                "font-semibold": node.bold,
                italic: node.italic,
                underline: node.underline,
                "line-through": node.strikethrough,
              })}
            >
              {node.text}
            </span>
          );
        case "link":
          return (
            <a key={index} className="cursor-pointer text-[var(--tau-accent)]">
              {node.children?.[0].text}
            </a>
          );
        case "inline-math":
          return <Katex tex={node.tex} key={index} inline />;
        case "html-inline":
          return <span dangerouslySetInnerHTML={{ __html: node.html }} key={index} />;
        case "inline-image":
          return (
            <span style={{ display: "inline-block" }} key={index}>
              <LocalImage src={node.url} alt={node.alt} />
            </span>
          );
        case "underline":
          return (
            <span key={index} className="underline">
              {node.children?.[0].text}
            </span>
          );
        case "styled-text":
          return (
            <span
              key={index}
              style={{
                color: StyledTextColorStyle["light"][node.color].color,
                backgroundColor: StyledTextColorStyle["light"][node.color].backgroundColor,
                border: `1px solid ${StyledTextColorStyle["light"][node.color].color}`,
                padding: "4px 8px",
              }}
            >
              {node.children?.[0].text}
            </span>
          );
        case "kbd":
          return <kbd key={index}>{node.children?.[0]?.text}</kbd>;
        default:
          return undefined;
      }
    })
    .filter((element): element is ReactElement => Boolean(element));
};

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

export const getEditorTextLength = (editor: Editor, value: Descendant[]): number => {
  // 找到所有的 CodeBlock
  const codeBlocks: Array<CodeBlockElement> = [];
  const mathElements: Array<InlineMathElement | BlockMathElement> = [];
  const traverse = (node: Descendant) => {
    if (node.type === "code-block") {
      codeBlocks.push(node);
      return;
    }
    if (node.type === "inline-math" || node.type === "block-math") {
      mathElements.push(node);
      return;
    }
    // @ts-ignore
    if (node.children && node.children.length > 0) {
      // @ts-ignore
      node.children.forEach(child => {
        traverse(child);
      });
    }
  };
  for (const node of value) {
    traverse(node);
  }
  let codeBlockLength = 0;
  codeBlocks.forEach(node => {
    codeBlockLength += wordsCount(node.code);
  });

  let mathLength = 0;
  mathElements.forEach(node => {
    mathLength += wordsCount(node.tex);
  });

  return (
    wordsCount(
      Editor.string(editor, {
        anchor: Editor.start(editor, [0]),
        focus: Editor.end(editor, []),
      })
    ) +
    codeBlockLength +
    mathLength
  );
};

export const getInlineElementText = (element: InlineElement | FormattedText): string => {
  switch (element.type) {
    case "formatted":
      return element.text;
    case "link":
      return element.children?.[0].text;
    case "inline-math":
      return element.tex;
    case "html-inline":
      return element.html;
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
