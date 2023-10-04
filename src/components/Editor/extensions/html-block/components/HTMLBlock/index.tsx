import {RenderElementProps} from "slate-react";
import {HTMLBlockElement} from "@/components/Editor/types";
import React, {PropsWithChildren} from "react";
import styles from './index.module.less';
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";
import { Transforms } from "slate";
import { ReactEditor, useSlate } from "slate-react";

interface HTMLBlockProps {
  attributes: RenderElementProps['attributes'];
  element: HTMLBlockElement;
}

const HTMLBlock: React.FC<PropsWithChildren<HTMLBlockProps>> = (props) => {
  const { attributes, children, element } = props;
  const { html } = element;

  const editor = useSlate();

  const handleOnChange = (code: string) => {
    Transforms.setNodes(editor, { html: code }, { at: ReactEditor.findPath(editor, element) });
  }

  const renderEmpty = () => {
    return <div contentEditable={false} className={styles.empty}>点击编辑 HTML 内容</div>
  }

  return (
    <div {...attributes} className={styles.container}>
      <PreviewWithEditor
        mode={'htmlmixed'}
        initValue={html}
        onChange={handleOnChange}
        element={element}
        extend
      >
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : renderEmpty()}
      </PreviewWithEditor>
      {children}
    </div>
  )
}

export default HTMLBlock;