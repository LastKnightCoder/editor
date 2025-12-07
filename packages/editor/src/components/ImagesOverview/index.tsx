import { useMemoizedFn } from "ahooks";
import { PortalToBody } from "@tau/shared";
import classnames from "classnames";
import { CloseOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import { useSlateStatic } from "slate-react";

import { useImagesOverviewStore } from "../../stores";

import styles from "./index.module.less";

const ImagesOverview = () => {
  const editor = useSlateStatic();

  const {
    isShowImagesOverview,
    imageElements,
    hasNextImage,
    hasPrevImage,
    currentImageIndex,
    switchImage,
    closeImagesOverview,
  } = useImagesOverviewStore((state) => ({
    isShowImagesOverview: state.isShowImagesOverview,
    imageElements: state.imageElements,
    hasNextImage: state.hasNextImage,
    hasPrevImage: state.hasPrevImage,
    currentImageIndex: state.currentImageIndex,
    switchImage: state.switchImage,
    closeImagesOverview: state.closeImagesOverview,
  }));

  const Image = editor.services?.components?.Image;

  const switchNext = useMemoizedFn(() => {
    switchImage(true);
  });

  const switchPrev = useMemoizedFn(() => {
    switchImage(false);
  });

  if (!isShowImagesOverview) return null;

  return (
    <div>
      <PortalToBody>
        <div className={styles.container}>
          <div className={styles.mask} onClick={closeImagesOverview}></div>
          <div className={styles.imageContainer} onClick={closeImagesOverview}>
            {Image ? (
              <Image
                url={imageElements[currentImageIndex].url}
                alt={imageElements[currentImageIndex].alt}
                className={styles.image}
              />
            ) : (
              <img
                src={imageElements[currentImageIndex].url}
                alt={imageElements[currentImageIndex].alt}
                className={styles.image}
              />
            )}
          </div>
          <div className={styles.close} onClick={closeImagesOverview}>
            <CloseOutlined />
          </div>
          <div
            className={classnames(styles.prev, {
              [styles.none]: !hasPrevImage,
            })}
            onClick={switchPrev}
          >
            <LeftOutlined />
          </div>
          <div
            className={classnames(styles.next, {
              [styles.none]: !hasNextImage,
            })}
            onClick={switchNext}
          >
            <RightOutlined />
          </div>
        </div>
      </PortalToBody>
    </div>
  );
};

export default ImagesOverview;
