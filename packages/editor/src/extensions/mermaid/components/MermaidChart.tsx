import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import Mermaid from "./Mermaid";
import type { MermaidRenderStyle } from "@tau/shared";
import { Workflow, Settings2, Image, FileText } from "lucide-react";

import type { MermaidElement } from "../../../types";
import PreviewWithEditor from "../../../components/PreviewWithEditor";

interface MermaidProps {
  attributes: RenderElementProps["attributes"];
  element: MermaidElement;
}

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = (props) => {
  const { attributes, element, children } = props;
  const { chart, renderStyle, svg, compiledFrom } = element;
  const editor = useSlateStatic();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="flex items-center justify-center h-14 text-[#99A1AF] cursor-pointer select-none"
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
      { at: ReactEditor.findPath(editor, element) },
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
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const setRenderStyle = (nextStyle: MermaidRenderStyle) => {
    Transforms.setNodes(
      editor,
      { renderStyle: nextStyle },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const clearRenderStyle = () => {
    Transforms.unsetNodes(editor, "renderStyle", {
      at: ReactEditor.findPath(editor, element),
    });
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
          extraMenuItemsBuilder={() => [
            {
              key: "mermaid-render-style",
              label: "渲染模式",
              icon: <Workflow size={16} />,
              children: [
                {
                  key: "mermaid-render-style-follow-global",
                  label: "跟随全局默认",
                  icon: <Settings2 size={14} />,
                  disabled: renderStyle === undefined,
                  onSelect: clearRenderStyle,
                },
                {
                  key: "mermaid-render-style-svg",
                  label: "SVG",
                  icon: <Image size={14} />,
                  disabled: renderStyle === "svg",
                  onSelect: () => setRenderStyle("svg"),
                },
                {
                  key: "mermaid-render-style-ascii-unicode",
                  label: "ASCII",
                  icon: <FileText size={14} />,
                  disabled: renderStyle === "ascii-unicode",
                  onSelect: () => setRenderStyle("ascii-unicode"),
                },
              ],
            },
          ]}
        >
          {chart ? (
            <Mermaid
              chart={chart}
              renderStyleOverride={renderStyle}
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
