import { useMemo, useState, useRef } from "react";
import { SwiperSlide, Swiper } from "swiper/react";
import { Pagination, Thumbs } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { ImageGallery } from "@tau/shared";
import type {
  ImageBorderRadiusPreset,
  ImageGalleryItem,
  ObjectFitMode,
  ImageShadowPreset,
} from "../../../../types";
import { useSlateStatic } from "slate-react";
import useTheme from "../../../../hooks/useTheme";
import { getImageAppearanceStyle } from "../../../image/utils/appearance";

import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";
import "swiper/css/thumbs";

interface ISwipeImageGalleryProps {
  items: ImageGalleryItem[];
  objectFit?: ObjectFitMode;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
}

const SwipeImageGallery = (props: ISwipeImageGalleryProps) => {
  const {
    items,
    objectFit = "contain",
    borderRadius = "none",
    shadow = false,
  } = props;
  const editor = useSlateStatic();
  const Image = editor.services?.components?.Image;
  const { theme } = useTheme();
  const swiperRef = useRef<SwiperType | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const imageAppearanceStyle = useMemo(
    () => getImageAppearanceStyle({ borderRadius, shadow }),
    [borderRadius, shadow],
  );

  // 全屏浏览用的图片列表
  const galleryImages = useMemo(() => items.map((item) => item.url), [items]);

  const handleImageClick = () => {
    // 获取当前 swiper 的真实索引
    const realIndex = swiperRef.current?.realIndex ?? 0;
    setGalleryIndex(realIndex);
    setShowGallery(true);
  };

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
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        {items.map((item) => (
          <SwiperSlide
            key={item.id}
            data-src={item.url}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={handleImageClick}
          >
            {renderImage(item.url, item.desc || "")}
          </SwiperSlide>
        ))}
      </Swiper>
      <ImageGallery
        images={galleryImages}
        open={showGallery}
        onClose={() => setShowGallery(false)}
        defaultIndex={galleryIndex}
        theme={theme}
      />
    </div>
  );
};

export default SwipeImageGallery;
