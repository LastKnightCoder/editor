import React, {PropsWithChildren} from 'react';
import { Transforms } from "slate";
import { RenderElementProps, useSlate , ReactEditor } from 'slate-react';
import Mermaid from './Mermaid';

import { MermaidElement } from '../../types';
import PreviewWithEditor from "../PreviewWithEditor";

import styles from './index.module.less';


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
      <div contentEditable={false} className={styles.empty}>点击编辑图表</div>
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
        center
      >
        { chart ? <Mermaid chart={chart} /> : renderEmpty() }
      </PreviewWithEditor>
      {children}
    </div>
  )
}

export default MermaidChart;