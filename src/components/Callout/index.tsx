import React from 'react';
import classnames from 'classnames';
import styles from './index.module.less';
import { RenderElementProps } from "slate-react";
import { CalloutElement } from "../../custom-types";
import AddParagraph from "../AddParagraph";

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
  const { calloutType, title } = element;
  const { title: defaultTitle } = configs[calloutType];

  return (
    <div {...attributes} >
      <div  className={classnames(styles.callout, styles[calloutType])}>
        <p contentEditable={false} className={styles.title}>{title || defaultTitle}</p>
        {children}
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default Callout;