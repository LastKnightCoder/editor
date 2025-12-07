import { useMemo, useState } from "react";
import { ImageGallery, LocalImage } from "@tau/shared";
import useTheme from "../../../../hooks/useTheme";
import type { ImageGalleryItem } from "../../../../types/element/gallery";
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
            alt={item.desc || ""}
            style={{ height: height || 200 }}
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
