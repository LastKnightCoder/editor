import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { Typst as TypstRenderer } from "@tau/shared";
import { ICompilerService } from "../../../../services";

import type { TypstElement } from "../../../types";
import PreviewWithEditor from "../../../../components/PreviewWithEditor";

interface TypstProps {
  attributes: RenderElementProps["attributes"];
  element: TypstElement;
}

const Typst: React.FC<PropsWithChildren<TypstProps>> = props => {
  const { attributes, element, children } = props;
  const { content, html, compiledFrom } = element;

  const editor = useSlateStatic();
  const compileTypst = editor.tryGetService(ICompilerService)?.typst;

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        className="py-3 text-gray-400 dark:text-gray-500"
        style={{ userSelect: "none" }}
      >
        点击编辑 Typst
      </div>
    );
  };

  const handleChange = (code: string) => {
    Transforms.setNodes(
      editor,
      {
        content: code,
        html: "",
        compiledFrom: undefined,
        compiledAt: undefined,
      },
      { at: ReactEditor.findPath(editor, element) }
    );
  };

  const handleChangeHtml = (compiledHtml: string, compiledCode: string) => {
    Transforms.setNodes(
      editor,
      {
        html: compiledHtml,
        compiledFrom: compiledCode,
        compiledAt: Date.now(),
      },
      { at: ReactEditor.findPath(editor, element) }
    );
  };

  return (
    <div {...attributes}>
      <PreviewWithEditor
        mode={"stex"}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        {content.trim() ? (
          <TypstRenderer
            content={content}
            compileTypst={compileTypst}
            initialHtml={html || ""}
            compiledFrom={compiledFrom}
            onCompiled={handleChangeHtml}
          />
        ) : (
          renderEmpty()
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Typst;
