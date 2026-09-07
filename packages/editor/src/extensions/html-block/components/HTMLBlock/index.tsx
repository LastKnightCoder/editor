import { RenderElementProps } from "slate-react";
import type { HTMLBlockElement } from "../../../types";
import React, { PropsWithChildren, Fragment } from "react";
import styles from "./index.module.less";
import PreviewWithEditor from "../../../../components/PreviewWithEditor";
import { useTailwindRuntimeCss } from "../../../../hooks/useTailwindRuntimeCss";
import { ICompilerService } from "../../../../services";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic } from "slate-react";

interface HTMLBlockProps {
  attributes: RenderElementProps["attributes"];
  element: HTMLBlockElement;
}

const HTMLBlock: React.FC<PropsWithChildren<HTMLBlockProps>> = props => {
  const { attributes, children, element } = props;
  const { html } = element;
  const editor = useSlateStatic();
  const tailwindCss = useTailwindRuntimeCss(html, "html", editor.tryGetService(ICompilerService));

  const handleOnChange = (code: string) => {
    Transforms.setNodes(editor, { html: code }, { at: ReactEditor.findPath(editor, element) });
  };

  const renderEmpty = () => {
    return (
      <div contentEditable={false} className={styles.empty}>
        点击编辑 HTML 内容
      </div>
    );
  };

  return (
    <div {...attributes} className={styles.container}>
      <PreviewWithEditor
        mode={"htmlmixed"}
        initValue={html}
        onChange={handleOnChange}
        element={element}
        extend
      >
        {html ? (
          <Fragment>
            {tailwindCss ? <style dangerouslySetInnerHTML={{ __html: tailwindCss }} /> : null}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </Fragment>
        ) : (
          renderEmpty()
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default HTMLBlock;
