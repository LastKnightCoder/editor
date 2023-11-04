import { CloseOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useImagesOverviewStore } from "../../stores";
import styles from './index.module.less';
import classnames from "classnames";

const ImagesOverview = () => {
  const { isShowImagesOverview, imageElements, hasNextImage, hasPrevImage, currentImageIndex, switchImage, closeImagesOverview } = useImagesOverviewStore(state => ({
    isShowImagesOverview: state.isShowImagesOverview,
    imageElements: state.imageElements,
    hasNextImage: state.hasNextImage,
    hasPrevImage: state.hasPrevImage,
    currentImageIndex: state.currentImageIndex,
    switchImage: state.switchImage,
    closeImagesOverview: state.closeImagesOverview,
  }));

  const switchNext = () => {
    switchImage(true);
  }

  const switchPrev = () => {
    switchImage(false);
  }

  const renderContent = () => {
    if (!isShowImagesOverview) {
      return null;
    }

    return (
      <div className={styles.container}>
        <div className={styles.mask}></div>
        <div className={styles.imageContainer} onClick={closeImagesOverview}>
          <img className={styles.image} src={imageElements[currentImageIndex].url} alt={imageElements[currentImageIndex].alt}/>
        </div>
        <div className={styles.close} onClick={closeImagesOverview}>
          <CloseOutlined />
        </div>
        <div className={classnames(styles.prev, { [styles.none]: !hasPrevImage })} onClick={switchPrev}>
          <LeftOutlined />
        </div>
        <div className={classnames(styles.next, { [styles.none]: !hasNextImage })} onClick={switchNext}>
          <RightOutlined />
        </div>
      </div>
    )
  }

  return (
    <div>
      {renderContent()}
    </div>
  )
}

export default ImagesOverview;