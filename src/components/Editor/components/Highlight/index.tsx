import React from 'react';
import classnames from 'classnames';
import { HighlightColor } from "@/components/Editor/types";
import styles from './index.module.less';

interface IHighlightProps {
  type?: HighlightColor;
}

const Highlight: React.FC<React.PropsWithChildren<IHighlightProps>> = (props) => {
  const { type = 'yellow' } = props;
  return (
    <span
      className={classnames(styles.highlight, styles[type])}
      {...props}
    >
      {props.children}
    </span>
  )
}

export default Highlight;
