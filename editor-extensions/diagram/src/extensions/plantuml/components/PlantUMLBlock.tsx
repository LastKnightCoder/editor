import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import PlantUML from "../../../renderers/PlantUML";
import { useEditorTheme as useTheme } from "@tau/editor/api";

import type { PlantUMLElement } from "../../../types/plantuml";
import { PreviewWithEditor } from "@tau/editor-source-view";

interface PlantUMLBlockProps {
  attributes: RenderElementProps["attributes"];
  element: PlantUMLElement;
  server?: string;
  darkTheme?: string;
}

const PlantUMLBlock: React.FC<PropsWithChildren<PlantUMLBlockProps>> = props => {
  const { attributes, element, children, server, darkTheme } = props;
  const { content } = element;
  const editor = useSlateStatic();
  const { isDark } = useTheme();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex h-14 cursor-pointer select-none items-center justify-center text-[#99A1AF]"
      >
        点击编辑 PlantUML
      </div>
    );
  };

  const onChange = (value: string) => {
    Transforms.setNodes(
      editor,
      {
        content: value,
      },
      { at: ReactEditor.findPath(editor, element) }
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
          {content ? (
            <PlantUML content={content} isDark={isDark} server={server} darkTheme={darkTheme} />
          ) : (
            renderEmpty()
          )}
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default PlantUMLBlock;
