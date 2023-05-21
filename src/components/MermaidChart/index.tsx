import React, {PropsWithChildren} from 'react';
import { RenderElementProps, useSlate , ReactEditor } from 'slate-react';
import { MermaidElement } from '../../custom-types';
import PreviewWithEditor from "../PreviewWithEditor";
import { Mermaid } from 'mdx-mermaid/lib/Mermaid';

import styles from './index.module.less';
import { Transforms } from "slate";

interface MermaidProps {
  attributes: RenderElementProps['attributes'];
  element: MermaidElement;
}

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = (props) => {
  const { attributes, element, children } = props;
  const { chart } = element;
  const editor = useSlate();

  const renderEmpty = () => {
    return (
      <div className={styles.empty}>点击编辑图表</div>
    )
  }

  const onChange = (value: string) => {
    Transforms.setNodes(editor, { chart: value }, { at: ReactEditor.findPath(editor, element) });
  }

  return (
    <div {...attributes} className={styles.mermaid}>
      <PreviewWithEditor
        mode={'mermaid'}
        initValue={chart}
        onChange={onChange}
        element={element}
      >
        { chart ? <Mermaid chart={chart} /> : renderEmpty() }
      </PreviewWithEditor>
      {children}
    </div>
  )
}

export default MermaidChart;