import { useMemo, useState } from "react";
import ImageGallery from "@/components/ImageGallery";

import { ImageGalleryItem } from "@/components/Editor/types";
import LocalImage from "@/components/LocalImage";

import styles from "./index.module.less";
import useTheme from "@/hooks/useTheme";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  columnCount?: number;
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items, columnCount = 3 } = props;
  const [showGallery, setShowGallery] = useState(false);
  const { theme } = useTheme();

  const images = useMemo(() => {
    return items.map((item) => item.url);
  }, [items]);

  return (
    <div
      className={styles.gridContainer}
      style={{
        columnCount,
      }}
      onClick={() => setShowGallery(true)}
    >
      {items.map((item) => (
        <div data-src={item.url} key={item.id} className={styles.gridItem}>
          <LocalImage url={item.url} alt={item.desc || ""} />
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

export default VerticalImageGallery;
