import React, {PropsWithChildren} from "react";
import { RenderElementProps } from "slate-react";
import { Transforms } from "slate";
import { ReactEditor, useSlate } from "slate-react";

import Katex from "@/components/Katex";
import { BlockMathElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";

import styles from './index.module.less';

interface BlockMathProps {
  attributes: RenderElementProps['attributes'];
  element: BlockMathElement;
}

const BlockMath: React.FC<PropsWithChildren<BlockMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const editor = useSlate();

  const handleInputChange = (code: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { tex: code }, { at: path });
  }

  return (
    <div {...attributes} className={styles.blockMath}>
      <PreviewWithEditor
        mode={'stex'}
        initValue={tex}
        onChange={handleInputChange}
        element={element}
      >
        {tex ? <Katex tex={tex} /> : <div contentEditable={false} className={styles.empty}>点击编辑公式</div>}
      </PreviewWithEditor>
      {children}
    </div>
  )
}

export default BlockMath;
