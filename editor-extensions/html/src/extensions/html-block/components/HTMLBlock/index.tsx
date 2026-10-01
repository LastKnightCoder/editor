import { RenderElementProps } from "slate-react";
import type { HTMLBlockElement } from "../../../../types";
import React, { PropsWithChildren, Fragment } from "react";
import { PreviewWithEditor } from "@tau/editor-source-view";
import { useTailwindRuntimeCss } from "../../../../hooks/useTailwindRuntimeCss";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";
import { CodeXml } from "lucide-react";

interface HTMLBlockProps {
  attributes: RenderElementProps["attributes"];
  element: HTMLBlockElement;
}

const HTMLBlock: React.FC<PropsWithChildren<HTMLBlockProps>> = props => {
  const { attributes, children, element } = props;
  const { html } = element;
  const editor = useSlateStatic();
  const tailwindCss = useTailwindRuntimeCss(
    html,
    "html",
    editor.tryGetService(IRuntimeStyleCompiler)
  );

  const handleOnChange = (code: string) => {
    Transforms.setNodes(editor, { html: code }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div {...attributes} className="h-auto cursor-pointer">
      <PreviewWithEditor
        mode={"htmlmixed"}
        title="HTML"
        icon={CodeXml}
        initValue={html}
        onChange={handleOnChange}
        element={element}
        extend
      >
        <Fragment>
          {tailwindCss ? <style dangerouslySetInnerHTML={{ __html: tailwindCss }} /> : null}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </Fragment>
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default HTMLBlock;
