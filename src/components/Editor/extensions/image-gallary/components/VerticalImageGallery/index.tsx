import { useRef, useEffect } from 'react';
import lightGallery from "lightgallery";

import { ImageGalleryItem } from '@/components/Editor/types';

import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-thumbnail.css';

import styles from './index.module.less';

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  columnCount?: number;
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items, columnCount = 3 } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const galleryInstance = lightGallery(ref.current, {
      plugins: [lgZoom, lgThumbnail],
      thumbnail: true,
      zoomFromOrigin: true,
    });

    return () => {
      galleryInstance.destroy();
    }
  }, [items]);

  return (
    <div
      ref={ref}
      className={styles.gridContainer}
      style={{
        columnCount
      }}
    >
      {
        items.map((item) => (
          <div data-src={item.url} key={item.id} className={styles.gridItem}>
            <img src={item.url} alt={item.desc || ''}/>
          </div>
        ))
      }
    </div>
  )
}

export default VerticalImageGallery;