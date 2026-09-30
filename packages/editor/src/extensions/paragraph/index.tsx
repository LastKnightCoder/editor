import { RenderElementProps } from "slate-react";
import type { ParagraphElement } from "../types";
import React from "react";

import Paragraph from "./components/Paragraph";

import { defineElement, defineExtension } from "../../api";
import { inlineCode } from "./plugins/inlineCode";
import hoveringBarElements from "./hovering-bar-configs";

// 创建一个 memo 化的渲染器组件
const MemoizedParagraphRenderer = React.memo(
  ({ element, attributes, children }: RenderElementProps) => {
    return (
      <Paragraph element={element as ParagraphElement} attributes={attributes}>
        {children}
      </Paragraph>
    );
  }
);

const paragraphExtension = defineExtension({
  id: "tau.paragraph",
  elements: [
    defineElement<ParagraphElement>({
      type: "paragraph",
      kind: "block",
      render: MemoizedParagraphRenderer as never,
      drag: true,
    }),
  ],
  toolbar: hoveringBarElements,
  // 展开选区输入 ` 加 code 标记是文本级快捷语法（选区在任何块内都生效），保留为插件
  plugins: [inlineCode],
});

export default paragraphExtension;
