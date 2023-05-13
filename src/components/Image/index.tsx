import React from 'react';
import { FullscreenOutlined, DeleteOutlined } from '@ant-design/icons';

import {ReactEditor, RenderElementProps, useSlate} from "slate-react";
import {ImageElement} from "../../custom-types";

import styles from './index.module.less';
import AddParagraph from "../AddParagraph";
import {Transforms} from "slate";

import { useImagesOverviewStore } from "../../stores";

interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '' } = element;

  const editor = useSlate();
  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = () => {
    showImageOverview(element, editor);
  }

  const deleteImage = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, {
      at: path
    });
    ReactEditor.focus(editor);
  }

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} {...attributes}>
      {children}
      <div className={styles.imageContainer}>
        <img className={styles.image} src={url} alt={alt} onClick={showOverView}/>
        <div className={styles.actions}>
          <div onClick={showOverView} className={styles.overview}>
            <FullscreenOutlined />
          </div>
          <div className={styles.divider}></div>
          <div onClick={deleteImage} className={styles.delete}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;