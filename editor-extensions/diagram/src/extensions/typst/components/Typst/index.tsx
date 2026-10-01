import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import TypstRenderer from "../../../../renderers/Typst";
import { ITypstCompiler } from "../../../../../services";

import type { TypstElement } from "../../../../types/typst";
import { PreviewWithEditor, PreviewErrorReporter } from "@tau/editor-source-view";
import { FileType } from "lucide-react";

interface TypstProps {
  attributes: RenderElementProps["attributes"];
  element: TypstElement;
}

const Typst: React.FC<PropsWithChildren<TypstProps>> = props => {
  const { attributes, element, children } = props;
  const { content, html, compiledFrom } = element;

  const editor = useSlateStatic();
  const compileTypst = editor.tryGetService(ITypstCompiler)?.compile;

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
        title="Typst"
        icon={FileType}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        <PreviewErrorReporter>
          {onError => (
            <TypstRenderer
              content={content}
              compileTypst={compileTypst}
              initialHtml={html || ""}
              compiledFrom={compiledFrom}
              onCompiled={handleChangeHtml}
              onError={onError}
            />
          )}
        </PreviewErrorReporter>
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Typst;
