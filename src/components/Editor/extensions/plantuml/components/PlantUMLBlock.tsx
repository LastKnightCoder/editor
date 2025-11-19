import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import PlantUML from "@/components/PlantUML";

import { PlantUMLElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";

interface PlantUMLBlockProps {
  attributes: RenderElementProps["attributes"];
  element: PlantUMLElement;
}

const PlantUMLBlock: React.FC<PropsWithChildren<PlantUMLBlockProps>> = (
  props,
) => {
  const { attributes, element, children } = props;
  const { content } = element;
  const editor = useSlate();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex items-center justify-center h-14 text-[#99A1AF] cursor-pointer select-none"
      >
        点击编辑 PlantUML
      </div>
    );
  };

  const onChange = (value: string) => {
    Transforms.setNodes(
      editor,
      { content: value },
      { at: ReactEditor.findPath(editor, element) },
    );
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
          {content ? <PlantUML content={content} /> : renderEmpty()}
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default PlantUMLBlock;
