import React, {useMemo} from 'react';
import { RenderLeafProps } from "slate-react";
import Highlight from "../Highlight";
import classnames from 'classnames';
import styles from './index.module.less';

import {FormattedText} from "../../types";

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
    strikethrough
  } = leaf;

  const className = classnames({
    [styles.bold]: bold,
    [styles.italic]: italic,
    // 如果没有文字，就设置一个 padding-left: 0.1px，这样即使在链接等后面也可以点击到
    // [styles.padding]: true
  });

  const textDecorations = useMemo(() => {
    let text = '';
    if (underline) {
      text += 'underline ';
    }
    if (strikethrough) {
      text += 'line-through ';
    }
    return text;
  }, [underline, strikethrough]);

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
    <span {...attributes} className={className} style={{
      textDecoration: textDecorations
    }}>
      { addHighlightWrapper(addCodeWrapper(children)) }
    </span>
  )
}

export default FormattedText;