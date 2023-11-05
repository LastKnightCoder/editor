import { DeleteOutlined } from '@ant-design/icons';
import { ImageGalleryItem } from "@/components/Editor/types";

import styles from './index.module.less';

interface IImageItemProps {
  imageItem: ImageGalleryItem;
  onDelete: (item: ImageGalleryItem) => void;
}

const ImageItem = (props: IImageItemProps) => {
  const { imageItem, onDelete } = props;

  return (
    <div className={styles.container}>
      <img className={styles.img} src={imageItem.url} alt={imageItem.desc || ''} />
      <div className={styles.delete} onClick={() => { onDelete(imageItem) }}>
        <DeleteOutlined />
      </div>
    </div>
  )
}

export default ImageItem;