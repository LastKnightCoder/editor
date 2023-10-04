import React, { PropsWithChildren } from 'react';
import { RenderElementProps } from "slate-react";
import classnames from 'classnames';
import { BlockquoteElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useTheme from "@/hooks/useTheme.ts";

import styles from './index.module.less';


interface IBlockQuoteProps {
  attributes: RenderElementProps['attributes'];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = (props) => {
  const { attributes, element, children } = props;

  const { isDark } = useTheme();

  return (
    <div {...attributes}>
      <blockquote className={classnames(styles.blockquote, { [styles.dark]: isDark })}>
        {children}
      </blockquote>
      <AddParagraph element={element} />
    </div>
  )
}

export default Blockquote;
