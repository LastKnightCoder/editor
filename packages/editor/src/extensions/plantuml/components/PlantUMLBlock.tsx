import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import PlantUML from "@tau/shared/src/components/PlantUML";
import useTheme from "../../../hooks/useTheme";

import type { PlantUMLElement } from "../../../types";
import PreviewWithEditor from "../../../components/PreviewWithEditor";

interface PlantUMLBlockProps {
  attributes: RenderElementProps["attributes"];
  element: PlantUMLElement;
}

const PlantUMLBlock: React.FC<PropsWithChildren<PlantUMLBlockProps>> = (
  props,
) => {
  const { attributes, element, children } = props;
  const { content, svg, compiledFrom } = element;
  const editor = useSlateStatic();
  const { isDark } = useTheme();
  const nodeFetch = async (url: string, options: RequestInit) => {
    if (editor.services?.utility?.nodeFetch) {
      return await editor.services.utility.nodeFetch(url, options);
    }
    const res = await fetch(url, options);
    return await res.text();
  };

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
      {
        content: value,
        svg: "",
        compiledFrom: undefined,
        compiledAt: undefined,
      },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const handleCompiled = (nextSvg: string, compiledCode: string) => {
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
            <PlantUML
              content={content}
              isDark={isDark}
              nodeFetch={nodeFetch}
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

export default PlantUMLBlock;
