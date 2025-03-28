import { Descendant } from "slate";
import { wordsCount } from "words-count";
import {
  BlockMathElement,
  CodeBlockElement,
  CustomBlockElement,
  FormattedText,
  HTMLBlockElement,
  InlineMathElement,
  ListItemElement,
  MermaidElement,
  TabsElement,
  TikzElement,
} from "@editor/types";

export const dfs = (editor: Descendant[], visit: (node: Descendant) => any) => {
  for (const node of editor) {
    visit(node);
    // @ts-ignore
    if (node.children && node.children.length > 0) {
      // @ts-ignore
      dfs(node.children, visit);
    }
  }
};

export const getContentLength = (value: Descendant[]) => {
  let length = 0;

  dfs(value, (node) => {
    if (node.type === "formatted") {
      length += wordsCount((node as FormattedText).text);
    } else if (node.type === "code-block") {
      length += wordsCount((node as CodeBlockElement).code);
    } else if (node.type === "inline-math" || node.type === "block-math") {
      length += wordsCount((node as InlineMathElement | BlockMathElement).tex);
    } else if (node.type === "tabs") {
      const tabs = (node as TabsElement).tabsContent;
      const notCurrentTabs = tabs.filter(
        (tab) => tab.key !== (node as TabsElement).activeKey,
      );
      for (const tab of notCurrentTabs) {
        length += getContentLength(tab.content);
      }
    } else if (node.type === "mermaid") {
      length += wordsCount((node as MermaidElement).chart);
    } else if (node.type === "html-block") {
      length += wordsCount((node as HTMLBlockElement).html);
    } else if (node.type === "custom-block") {
      length += wordsCount((node as CustomBlockElement).content);
    } else if (node.type === "tikz") {
      length += wordsCount((node as TikzElement).content);
    } else if (node.type === "list-item") {
      if ((node as ListItemElement).isFold) {
        length += getContentLength(
          (node as ListItemElement).allContent!.slice(1),
        );
      }
    }
  });

  return length;
};
