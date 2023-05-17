import React, {PropsWithChildren, useState} from "react";
import { RenderElementProps } from "slate-react";
import { MathJax } from "better-react-mathjax";
import { BlockMathElement } from "../../custom-types";
import AddParagraph from "../AddParagraph";
import { Popover, Input } from "antd";
import {Transforms} from "slate";
import { ReactEditor, useSlate } from "slate-react";
import styles from './index.module.less';

interface BlockMathProps {
  attributes: RenderElementProps['attributes'];
  element: BlockMathElement;
}

const InlineMath: React.FC<PropsWithChildren<BlockMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const [value, setValue] = useState(tex);
  const editor = useSlate();

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    Transforms.setNodes(editor, { tex: e.target.value }, { at: ReactEditor.findPath(editor, element) });
  }

  return (
    <div {...attributes} className={styles.blockMath}>
      <Popover
        trigger={'click'}
        arrow={false}
        style={{ maxWidth: 500, marginTop: 10 }}
        placement={'bottom'}
        content={<Input.TextArea rows={10} style={{ width: 500 }} value={value} onChange={handleInputChange} />}
      >
        <MathJax>
          <div>{`$$${tex}$$`}</div>
        </MathJax>
      </Popover>
      {children}
      <AddParagraph element={element} />
    </div>
  )
}

export default InlineMath;
