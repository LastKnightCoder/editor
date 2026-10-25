import { useTextFieldBinding } from "@tau/editor/api";
import { IEditorTextFields } from "@tau/editor/api";
import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";

import Katex from "../../renderers/Katex";
import type { BlockMathElement } from "../../types";
import { PreviewWithEditor, PreviewErrorReporter } from "@tau/editor-source-view";
import { Sigma } from "lucide-react";

interface BlockMathProps {
  attributes: RenderElementProps["attributes"];
  element: BlockMathElement;
}

const BlockMath: React.FC<PropsWithChildren<BlockMathProps>> = props => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const editor = useSlateStatic();
  const bound = Boolean(editor.tryGetService(IEditorTextFields));
  const source = useTextFieldBinding(bound ? element : undefined, "tex");

  const handleInputChange = (code: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: code }, { at: path });
  };

  return (
    <div
      {...attributes}
      className={[
        "cursor-pointer",
        "[&_div_mjx-container[jax=CHTML][display=true]]:mx-auto [&_div_mjx-container[jax=CHTML][display=true]]:my-[0.25em]",
        // 长公式在块内横向滚动，避免撑破编辑器容器
        "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-[2px]",
        "[&_.katex-display>.katex]:mx-auto [&_.katex-display>.katex]:my-0 [&_.katex-display>.katex]:w-fit",
      ].join(" ")}
    >
      <PreviewWithEditor
        mode={"stex"}
        title="公式"
        icon={Sigma}
        initValue={bound ? source.value : tex}
        textBinding={source.binding ?? undefined}
        onChange={bound ? undefined : handleInputChange}
        element={element}
        inPlace
        delimiters="$$"
        immediate
      >
        <PreviewErrorReporter>
          {onError => <Katex tex={bound ? source.value : tex} onError={onError} />}
        </PreviewErrorReporter>
      </PreviewWithEditor>
      {source.error && <div role="alert">{source.error}</div>}
      {children}
    </div>
  );
};

export default BlockMath;
