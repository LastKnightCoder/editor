import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Mermaid from "./Mermaid";

import type { MermaidElement } from "../../../types";
import PreviewWithEditor from "../../../components/PreviewWithEditor";

interface MermaidProps {
  attributes: RenderElementProps["attributes"];
  element: MermaidElement;
}

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = props => {
  const { attributes, element, children } = props;
  const { chart, svg, compiledFrom } = element;
  const editor = useSlateStatic();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex h-14 cursor-pointer select-none items-center justify-center text-[#99A1AF]"
      >
        点击编辑图表
      </div>
    );
  };

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
          initValue={chart}
          onChange={onChange}
          element={element}
          center
        >
          {chart ? (
            <Mermaid
              chart={chart}
              initialSvg={svg}
              compiledFrom={compiledFrom}
              onCompiled={handleCompiled}
            />
          ) : (
            renderEmpty()
          )}
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default MermaidChart;
