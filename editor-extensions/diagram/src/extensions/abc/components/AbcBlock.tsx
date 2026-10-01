import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Abc from "./Abc";

import type { AbcElement } from "../../../types/abc";
import { PreviewWithEditor } from "@tau/editor-source-view";
import { Music } from "lucide-react";

interface AbcBlockProps {
  attributes: RenderElementProps["attributes"];
  element: AbcElement;
}

const AbcBlock: React.FC<PropsWithChildren<AbcBlockProps>> = props => {
  const { attributes, element, children } = props;
  const { content } = element;
  const editor = useSlateStatic();

  const onChange = (value: string) => {
    Transforms.setNodes(editor, { content: value }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="mt-2.5 cursor-pointer">
      <div contentEditable={false}>
        <PreviewWithEditor
          mode={"text"}
          title="乐谱"
          icon={Music}
          initValue={content}
          onChange={onChange}
          element={element}
          center
        >
          <Abc content={content} />
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default AbcBlock;
