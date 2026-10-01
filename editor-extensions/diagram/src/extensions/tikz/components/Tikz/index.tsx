import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import TikZ from "../../../../renderers/TikZ";

import type { TikzElement } from "../../../../types/tikz";
import { PreviewWithEditor, PreviewErrorReporter } from "@tau/editor-source-view";
import { PenTool } from "lucide-react";

interface TikzProps {
  attributes: RenderElementProps["attributes"];
  element: TikzElement;
}

const Tikz: React.FC<PropsWithChildren<TikzProps>> = props => {
  const { attributes, element, children } = props;
  const { content } = element;

  const editor = useSlateStatic();

  const handleChange = (code: string) => {
    Transforms.setNodes(editor, { content: code }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="cursor-pointer">
      <PreviewWithEditor
        mode={"stex"}
        title="TikZ"
        icon={PenTool}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        <PreviewErrorReporter>
          {onError => <TikZ content={content} onError={onError} />}
        </PreviewErrorReporter>
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Tikz;
