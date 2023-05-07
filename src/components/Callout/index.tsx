import React from 'react';
import classnames from 'classnames';
import styles from './index.module.less';
import { RenderElementProps } from "slate-react";
import {CalloutElement} from "../../custom-types";

interface ICalloutProps {
  attributes: RenderElementProps['attributes'];
  element: CalloutElement;
}

const configs = {
  tip: {
    title: 'TIP',
  },
  info: {
    title: 'INFO',
  },
  warning: {
    title: 'WARNING',
  },
  danger: {
    title: 'DANGER',
  },
  note: {
    title: 'NOTE',
  }
}

const Callout: React.FC<React.PropsWithChildren<ICalloutProps>> = (props) => {
  const { attributes, element, children } = props;
  const { calloutType } = element;
  const { title } = configs[calloutType];
  return (
    <div {...attributes} className={classnames(styles.callout, styles[calloutType])}>
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  )
}

export default Callout;