import React, {PropsWithChildren, useState} from "react";
import {ReactEditor, RenderElementProps} from "slate-react";
import { MathJax } from "better-react-mathjax";
import { InlineMathElement } from "../../types";
import InlineChromiumBugfix from "../InlineChromiumBugFix";
import { Popover, Input } from "antd";
import styles from './index.module.less';
import {Transforms} from "slate";
import { useSlate } from "slate-react";

interface InlineMathProps {
  attributes: RenderElementProps['attributes'];
  element: InlineMathElement;
}

const InlineMath: React.FC<PropsWithChildren<InlineMathProps>> = (props) => {
  const { attributes, element, children } = props;
  const { tex } = element;
  const [value, setValue] = useState(tex);
  const editor = useSlate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    Transforms.setNodes(editor, { tex: e.target.value }, { at: ReactEditor.findPath(editor, element) });
  }

  return (
    <span {...attributes} className={styles.inlineMath}>
      <Popover
        trigger={'click'}
        arrow={false}
        style={{ maxWidth: 500, marginTop: 10 }}
        placement={'bottom'}
        content={<Input size={'large'} style={{ width: 500 }} value={value} onChange={handleInputChange} />}
      >
        { tex ? <MathJax inline dynamic><span>{`$${tex}$`}</span></MathJax> : null }
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </Popover>
    </span>
  )
}

export default InlineMath;
