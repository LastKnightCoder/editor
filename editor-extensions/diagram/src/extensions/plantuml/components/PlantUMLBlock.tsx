import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import PlantUML from "../../../renderers/PlantUML";
import { useEditorTheme as useTheme } from "@tau/editor/api";

import type { PlantUMLElement } from "../../../types/plantuml";
import { PreviewWithEditor, PreviewErrorReporter } from "@tau/editor-source-view";
import { Workflow } from "lucide-react";

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
          title="PlantUML"
          icon={Workflow}
          initValue={content}
          onChange={onChange}
          element={element}
          center
        >
          <PreviewErrorReporter>
            {onError => (
              <PlantUML
                content={content}
                isDark={isDark}
                server={server}
                darkTheme={darkTheme}
                onError={onError}
              />
            )}
          </PreviewErrorReporter>
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default PlantUMLBlock;
