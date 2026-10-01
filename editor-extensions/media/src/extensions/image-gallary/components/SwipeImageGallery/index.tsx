import { useMemo, useRef } from "react";
import { SwiperSlide, Swiper } from "swiper/react";
import { Pagination, Thumbs } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import type {
  ImageBorderRadiusPreset,
  ImageGalleryItem,
  ObjectFitMode,
  ImageShadowPreset,
} from "../../../../types";
import { getImageAppearanceStyle } from "../../../image/utils/appearance";

import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import { useEditorSlots } from "../../../../services/hooks";

interface ISwipeImageGalleryProps {
  items: ImageGalleryItem[];
  objectFit?: ObjectFitMode;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  /** 单击 / 双击当前这张，参数为该图在 items 中的序号 */
  onItemClick?: (index: number) => void;
  onItemDoubleClick?: (index: number) => void;
}

const SwipeImageGallery = (props: ISwipeImageGalleryProps) => {
  const {
    items,
    objectFit = "contain",
    borderRadius = "none",
    shadow = false,
    onItemClick,
    onItemDoubleClick,
  } = props;
  const { Image } = useEditorSlots();
  const swiperRef = useRef<SwiperType | null>(null);
  const imageAppearanceStyle = useMemo(
    () => getImageAppearanceStyle({ borderRadius, shadow }),
    [borderRadius, shadow]
  );

  // loop 模式下 DOM 里有复制的 slide，序号取 swiper 的真实索引
  const currentIndex = () => swiperRef.current?.realIndex ?? 0;

  const renderImage = (url: string, alt?: string) => (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...imageAppearanceStyle,
      }}
    >
      {Image ? (
        <Image
          url={url}
          alt={alt}
          style={{ display: "block", width: "100%", height: "100%", objectFit }}
        />
      ) : (
        <img
          src={url}
          alt={alt}
          style={{ display: "block", width: "100%", height: "100%", objectFit }}
        />
      )}
    </div>
  );

  return (
    <div
      contentEditable={false}
      style={{
        height: 400,
      }}
    >
      <Swiper
        slidesPerView={1}
        spaceBetween={30}
        loop={true}
        pagination={{
          clickable: true,
        }}
        modules={[Pagination, Thumbs]}
        onSwiper={swiper => {
          swiperRef.current = swiper;
        }}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        {items.map(item => (
          <SwiperSlide
            key={item.id}
            data-src={item.url}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => onItemClick?.(currentIndex())}
            onDoubleClick={() => onItemDoubleClick?.(currentIndex())}
          >
            {renderImage(item.url, item.desc || "")}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default SwipeImageGallery;
