import { RenderElementProps } from "slate-react";
import type { ParagraphElement } from "../../model/paragraph";
import React from "react";

import Paragraph from "./components/Paragraph";

import { defineElement, defineExtension } from "../../api";

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
      dataVersion: 1,
      kind: "block",
      render: MemoizedParagraphRenderer as never,
      drag: true,
    }),
  ],
});

export default paragraphExtension;
