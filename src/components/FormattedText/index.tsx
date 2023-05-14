import React from 'react';
import { RenderLeafProps } from "slate-react";
import Highlight from "../Highlight";
import classnames from 'classnames';
import styles from './index.module.less';

import {FormattedText} from "../../custom-types";

interface IFormattedTextProps {
  attributes: RenderLeafProps['attributes'];
  leaf: FormattedText;
}

const FormattedText: React.FC<React.PropsWithChildren<IFormattedTextProps>> = (props) => {
  const { attributes, leaf, children } = props;
  const {
    bold,
    italic,
    underline,
    highlight,
    code,
    text
  } = leaf;

  const className = classnames({
    [styles.bold]: bold,
    [styles.italic]: italic,
    [styles.underline]: underline,
    // 如果没有文字，就设置一个 padding-left: 0.1px，这样即使在链接等后面也可以点击到
    [styles.padding]: text === ''
  });

  const addHighlightWrapper = (originChildren: React.ReactNode) => {
    if (highlight) {
      return <Highlight>{originChildren}</Highlight>;
    }
    return originChildren;
  }

  const addCodeWrapper = (originChildren: React.ReactNode) => {
    if (code) {
      return <code className={styles.code}>{originChildren}</code>;
    }
    return originChildren;
  }

  return (
    <span {...attributes} className={className} >
      { addHighlightWrapper(addCodeWrapper(children)) }
    </span>
  )
}

export default FormattedText;