import { useRef, useEffect } from "react";
import lightGallery from "lightgallery";

import { ImageGalleryItem } from "@/components/Editor/types";
import LocalImage from "@/components/LocalImage";

import lgThumbnail from "lightgallery/plugins/thumbnail";
import lgZoom from "lightgallery/plugins/zoom";
import "lightgallery/css/lightgallery.css";
import "lightgallery/css/lg-zoom.css";
import "lightgallery/css/lg-thumbnail.css";

import styles from "./index.module.less";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  height?: number;
}

const HorizontalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items, height } = props;
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
    };
  }, [items]);

  return (
    <div ref={ref} className={styles.verticalGalleryContainer}>
      {items.map((item) => (
        <a href={item.url} key={item.id} className={styles.item}>
          <LocalImage
            url={item.url}
            style={{ height: height || 200 }}
            alt={item.desc || ""}
          />
        </a>
      ))}
    </div>
  );
};

export default HorizontalImageGallery;
