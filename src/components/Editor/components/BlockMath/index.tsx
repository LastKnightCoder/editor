import React, {PropsWithChildren} from "react";
import { RenderElementProps } from "slate-react";
import { MathJax } from "better-react-mathjax";
import { BlockMathElement } from "../../types";
import { Transforms } from "slate";
import { ReactEditor, useSlate } from "slate-react";
import PreviewWithEditor from "../PreviewWithEditor";


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
        <MathJax style={{ margin: 0 }}>
          {tex ? <div>{`$$${tex}$$`}</div> : <div contentEditable={false} className={styles.empty}>点击编辑公式</div>}
        </MathJax>
      </PreviewWithEditor>
      {children}
    </div>
  )
}

export default BlockMath;
