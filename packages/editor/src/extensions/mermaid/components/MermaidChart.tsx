import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Mermaid from "./Mermaid";

import type { MermaidElement } from "../../../types";
import PreviewWithEditor from "../../../components/PreviewWithEditor";
import { Workflow } from "lucide-react";

interface MermaidProps {
  attributes: RenderElementProps["attributes"];
  element: MermaidElement;
}

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = props => {
  const { attributes, element, children } = props;
  const { chart, svg, compiledFrom } = element;
  const editor = useSlateStatic();

  const onChange = (value: string) => {
    // Clear SVG cache when chart code changes
    Transforms.setNodes(
      editor,
      {
        chart: value,
        svg: "",
        compiledFrom: undefined,
        compiledAt: undefined,
      },
      { at: ReactEditor.findPath(editor, element) }
    );
  };

  const handleCompiled = (nextSvg: string, compiledCode: string) => {
    // Save compiled SVG to element
    Transforms.setNodes(
      editor,
      {
        svg: nextSvg,
        compiledFrom: compiledCode,
        compiledAt: Date.now(),
      },
      { at: ReactEditor.findPath(editor, element) }
    );
  };

  return (
    <div {...attributes} className="mt-2.5 cursor-pointer">
      <div contentEditable={false}>
        <PreviewWithEditor
          mode={"mermaid"}
          title="Mermaid"
          icon={Workflow}
          initValue={chart}
          onChange={onChange}
          element={element}
          center
        >
          <Mermaid
            chart={chart}
            initialSvg={svg}
            compiledFrom={compiledFrom}
            onCompiled={handleCompiled}
          />
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default MermaidChart;
