import { useRef, useEffect } from 'react';
import LightGallery from "lightgallery/react";
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import { ImageGalleryItem } from '@/components/Editor/types';

import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-thumbnail.css';

import styles from './index.module.less';
import {InitDetail} from "lightgallery/lg-events";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items } = props;
  const ref = useRef<InitDetail['instance']>();

  const onInit = (detail: InitDetail) => {
    if (detail) {
      ref.current = detail.instance;
    }
  }

  useEffect(() => {
    if (ref.current) {
      ref.current.refresh();
    }
  }, [items]);

  return (
    <LightGallery
      elementClassNames={styles.verticalGalleryContainer}
      onInit={onInit}
      plugins={[lgZoom, lgThumbnail]}
    >
      {
        items.map((item, index) => (
          <a href={item.url} key={index} style={{ flexGrow: 1 }}>
            <img src={item.url} style={{ objectFit: 'cover', height:250, width: '100%' }} alt={item.desc || ''}/>
          </a>
        ))
      }
    </LightGallery>
  )
}

export default VerticalImageGallery;