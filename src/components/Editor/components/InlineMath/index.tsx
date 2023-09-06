import React, {PropsWithChildren, useState} from "react";
import {Transforms} from "slate";
import {ReactEditor, RenderElementProps, useSlate} from "slate-react";
import { Popover, Input } from "antd";

import Katex from "@/components/Katex";

import { InlineMathElement } from "../../types";
import InlineChromiumBugfix from "../InlineChromiumBugFix";

import styles from './index.module.less';

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
        { tex ? <Katex tex={tex} inline/> : null }
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </Popover>
    </span>
  )
}

export default InlineMath;
