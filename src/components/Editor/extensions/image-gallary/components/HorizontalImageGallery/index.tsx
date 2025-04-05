import { useMemo, useState } from "react";

import { ImageGalleryItem } from "@/components/Editor/types";
import LocalImage from "@/components/LocalImage";
import ImageGallery from "@/components/ImageGallery";
import useTheme from "@/hooks/useTheme";

import styles from "./index.module.less";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  height?: number;
}

const HorizontalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items, height } = props;
  const [showGallery, setShowGallery] = useState(false);
  const { theme } = useTheme();

  const images = useMemo(() => {
    return items.map((item) => item.url);
  }, [items]);

  return (
    <div className={styles.verticalGalleryContainer}>
      {items.map((item) => (
        <div
          onClick={() => setShowGallery(true)}
          key={item.id}
          className={styles.item}
        >
          <LocalImage
            url={item.url}
            style={{ height: height || 200 }}
            alt={item.desc || ""}
          />
        </div>
      ))}
      <ImageGallery
        images={images}
        open={showGallery}
        onClose={() => setShowGallery(false)}
        theme={theme}
      />
    </div>
  );
};

export default HorizontalImageGallery;
