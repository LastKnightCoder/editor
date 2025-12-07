import { useMemo, useState } from "react";
import { ImageGallery } from "@tau/shared";
import useTheme from "../../../../hooks/useTheme";
import { ImageGalleryItem } from "../../../../types/element/gallery";
import styles from "./index.module.less";
import { useSlateStatic } from "slate-react";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  columnCount?: number;
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const { items, columnCount = 3 } = props;
  const [showGallery, setShowGallery] = useState(false);
  const { theme } = useTheme();
  const editor = useSlateStatic();
  const Image = editor.services?.components?.Image;
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
          {Image ? (
            <Image
              url={item.url}
              alt={item.desc || ""}
            />
          ) : (
            <img
              src={item.url}
              alt={item.desc || ""}
            />
          )}
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
