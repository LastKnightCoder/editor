import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Abc from "./Abc";

import type { AbcElement } from "../../../types/abc";
import { PreviewWithEditor } from "@tau/editor-source-view";

interface AbcBlockProps {
  attributes: RenderElementProps["attributes"];
  element: AbcElement;
}

const AbcBlock: React.FC<PropsWithChildren<AbcBlockProps>> = props => {
  const { attributes, element, children } = props;
  const { content } = element;
  const editor = useSlateStatic();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex h-14 cursor-pointer select-none items-center justify-center text-[#99A1AF]"
      >
        点击编辑乐谱
      </div>
    );
  };

  const onChange = (value: string) => {
    Transforms.setNodes(editor, { content: value }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="mt-2.5 cursor-pointer">
      <div contentEditable={false}>
        <PreviewWithEditor
          mode={"text"}
          initValue={content}
          onChange={onChange}
          element={element}
          center
        >
          {content ? <Abc content={content} /> : renderEmpty()}
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default AbcBlock;
