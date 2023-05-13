import React from 'react';

import {RenderElementProps} from "slate-react";
import {ImageElement} from "../../custom-types";

import styles from './index.module.less';
import AddParagraph from "../AddParagraph";

interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '' } = element;

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} {...attributes} className={styles.imageWrapper}>
      <img className={styles.image} src={url} alt={alt} />
      {children}
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;