import { useTextFieldBinding } from "@tau/editor/api";
import { IEditorTextFields } from "@tau/editor/api";
import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Mermaid from "./Mermaid";

import type { MermaidElement } from "../../../types/mermaid";
import { PreviewWithEditor } from "@tau/editor-source-view";
import { Workflow } from "lucide-react";

interface MermaidProps {
  attributes: RenderElementProps["attributes"];
  element: MermaidElement;
}

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = props => {
  const { attributes, element, children } = props;
  const { chart } = element;
  const editor = useSlateStatic();
  const bound = Boolean(editor.tryGetService(IEditorTextFields));
  const source = useTextFieldBinding(bound ? element : undefined, "chart");

  const onChange = (value: string) => {
    Transforms.setNodes(editor, { chart: value }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="mt-2.5 cursor-pointer">
      <div contentEditable={false}>
        <PreviewWithEditor
          mode={"mermaid"}
          title="Mermaid"
          icon={Workflow}
          initValue={bound ? source.value : chart}
          textBinding={source.binding ?? undefined}
          onChange={bound ? undefined : onChange}
          element={element}
          center
        >
          <Mermaid chart={bound ? source.value : chart} />
        </PreviewWithEditor>
      </div>
      {source.error && <div role="alert">{source.error}</div>}
      {children}
    </div>
  );
};

export default MermaidChart;
