import { SwiperSlide, Swiper } from 'swiper/react'

import { Pagination, Thumbs } from 'swiper/modules';
import { ImageGalleryItem } from '@/components/Editor/types';
import LocalImage from "@editor/components/LocalImage";

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';

interface ISwipeImageGalleryProps {
  items: ImageGalleryItem[];
}

const SwipeImageGallery = (props: ISwipeImageGalleryProps) => {
  const { items } = props;

  return (
    <div contentEditable={false} style={{
      height: 400
    }}>
      <Swiper
        slidesPerView={1}
        spaceBetween={30}
        loop={true}
        pagination={{
          clickable: true,
        }}
        modules={[Pagination, Thumbs]}
        style={{
          width: '100%',
          height: '100%'
        }}
      >
        {
          items.map(item => (
            <SwiperSlide key={item.id} data-src={item.url} style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <LocalImage
                url={item.url}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
                alt={item.desc || ''}
              />
            </SwiperSlide>
          ))
        }
      </Swiper>
    </div>
  )
}

export default SwipeImageGallery;