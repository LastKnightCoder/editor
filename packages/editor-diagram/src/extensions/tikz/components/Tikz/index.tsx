import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import TikZ from "../../../../renderers/TikZ";

import type { TikzElement } from "../../../../types/tikz";
import { PreviewWithEditor } from "@tau/editor-source-view";

interface TikzProps {
  attributes: RenderElementProps["attributes"];
  element: TikzElement;
}

const Tikz: React.FC<PropsWithChildren<TikzProps>> = props => {
  const { attributes, element, children } = props;
  const { content } = element;

  const editor = useSlateStatic();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex h-[3.75em] cursor-pointer select-none items-center justify-center text-[var(--ed-text-tertiary)]"
      >
        点击编辑Tikz
      </div>
    );
  };

  const handleChange = (code: string) => {
    Transforms.setNodes(editor, { content: code }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="cursor-pointer">
      <PreviewWithEditor
        mode={"stex"}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        {content.trim() ? <TikZ content={content} /> : renderEmpty()}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Tikz;
