import React, {PropsWithChildren} from 'react';
import {RenderElementProps} from "slate-react";
import {BlockquoteElement} from "../../types";
import styles from './index.module.less';
import AddParagraph from "../AddParagraph";

interface IBlockQuoteProps {
  attributes: RenderElementProps['attributes'];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = (props) => {
  const { attributes, element, children } = props;

  return (
    <div {...attributes}>
      <blockquote className={styles.blockquote}>
        {children}
      </blockquote>
      <AddParagraph element={element} />
    </div>
  )
}

export default Blockquote;
