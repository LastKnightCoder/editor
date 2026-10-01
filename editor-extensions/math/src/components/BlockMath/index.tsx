import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";

import Katex from "../../renderers/Katex";
import type { BlockMathElement } from "../../types";
import { PreviewWithEditor } from "@tau/editor-source-view";

interface BlockMathProps {
  attributes: RenderElementProps["attributes"];
  element: BlockMathElement;
}

const BlockMath: React.FC<PropsWithChildren<BlockMathProps>> = props => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const editor = useSlateStatic();

  const handleInputChange = (code: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: code }, { at: path });
  };

  return (
    <div
      {...attributes}
      className={[
        "cursor-pointer",
        "[&_div_mjx-container[jax=CHTML][display=true]]:mx-auto [&_div_mjx-container[jax=CHTML][display=true]]:my-[0.25em]",
        // 长公式在块内横向滚动，避免撑破编辑器容器
        "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-[2px]",
        "[&_.katex-display>.katex]:mx-auto [&_.katex-display>.katex]:my-0 [&_.katex-display>.katex]:w-fit",
      ].join(" ")}
    >
      <PreviewWithEditor
        mode={"stex"}
        initValue={tex}
        onChange={handleInputChange}
        element={element}
      >
        {tex ? (
          <Katex tex={tex} />
        ) : (
          <div
            contentEditable={false}
            className="flex h-[3.75em] cursor-pointer select-none items-center justify-center text-[var(--ed-text-tertiary)]"
          >
            点击编辑公式
          </div>
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default BlockMath;
