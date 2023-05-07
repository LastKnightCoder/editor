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
    code
  } = leaf;

  const className = classnames({
    [styles.bold]: bold,
    [styles.italic]: italic,
    [styles.underline]: underline,
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
    <span {...attributes} className={className} >{ addHighlightWrapper(addCodeWrapper(children)) }</span>
  )
}

export default FormattedText;