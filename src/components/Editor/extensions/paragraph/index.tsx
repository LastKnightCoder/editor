import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { ParagraphElement } from "@/components/Editor/types";
import React from "react";

import Paragraph from "./components/Paragraph";

import Base from "../base";
import IExtension from "../types";
import { inlineCode, normalizeParagraph } from "./plugins";
import hoveringBarElements from "./hovering-bar-configs";

// 缓存插件和悬浮栏元素，避免每次实例化都重新创建
const plugins = [inlineCode, normalizeParagraph];
const hoveringElements = hoveringBarElements;

// 创建一个 memo 化的渲染器组件
const MemoizedParagraphRenderer = React.memo(
  ({ element, attributes, children }: RenderElementProps) => {
    return (
      <Paragraph element={element as ParagraphElement} attributes={attributes}>
        {children}
      </Paragraph>
    );
  },
);

class ParagraphExtension extends Base implements IExtension {
  override type = "paragraph";

  override toMarkdown(_element: Element, children: string): string {
    return children;
  }

  override getPlugins() {
    return plugins;
  }

  override getHoveringBarElements() {
    return hoveringElements;
  }

  render(props: RenderElementProps) {
    return <MemoizedParagraphRenderer {...props} />;
  }
}

export default ParagraphExtension;
