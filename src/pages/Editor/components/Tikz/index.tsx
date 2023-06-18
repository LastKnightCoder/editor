import React, {PropsWithChildren, useMemo} from 'react';
import {RenderElementProps, useSlate, ReactEditor} from "slate-react";
import {TikzElement} from "../../types";
import PreviewWithEditor from "../PreviewWithEditor";
import './tikzjax.js';
import {Transforms} from "slate";
import styles from './index.module.less';
import './tikz.css';

interface TikzProps {
  attributes: RenderElementProps['attributes'];
  element: TikzElement;
}


const TikzRenderer = (props: { text: string }) => {
  const { text } = props;
  const tiny = useMemo(() => {
    let tikzSource = text;
    const remove = "&nbsp;";
    tikzSource = tikzSource.replaceAll(remove, "");


    let lines = tikzSource.split("\n");
    lines = lines.map(line => line.trim());
    lines = lines.filter(line => line);

    return lines.join("\n");
  }, [text]);

  const script = `<script type="text/tikz" data-show-console="true">${tiny}</script>`

  return (
    <div dangerouslySetInnerHTML={{ __html: script }} />
  )
}

const Tikz: React.FC<PropsWithChildren<TikzProps>> = (props) => {
  const { attributes, element, children } = props;
  const { content } = element;

  const editor = useSlate();

  const renderEmpty = () => {
    return (
      <div contentEditable={false} style={{ userSelect: 'none' }} className={styles.empty}>点击编辑Tikz</div>
    )
  }

  const handleChange = (code: string) => {
    Transforms.setNodes(editor, { content: code }, { at: ReactEditor.findPath(editor, element) });
  }

  return (
    <div {...attributes} className={styles.tikz}>
      <PreviewWithEditor
        mode={'stex'}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        {content.trim() ? <TikzRenderer text={content} /> : renderEmpty()}
      </PreviewWithEditor>
      {children}
    </div>
  )

}

export default Tikz;