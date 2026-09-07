import { useMemoizedFn } from "ahooks";
import { PortalToBody } from "@tau/shared";
import classnames from "classnames";
import { CloseOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import { useEffect } from "react";

import { useImagesOverviewStore } from "../../stores";
import { useEditorSlots } from "../../services";

import styles from "./index.module.less";

const ImagesOverview = () => {
  const {
    isShowImagesOverview,
    imageElements,
    hasNextImage,
    hasPrevImage,
    currentImageIndex,
    switchImage,
    closeImagesOverview,
  } = useImagesOverviewStore(state => ({
    isShowImagesOverview: state.isShowImagesOverview,
    imageElements: state.imageElements,
    hasNextImage: state.hasNextImage,
    hasPrevImage: state.hasPrevImage,
    currentImageIndex: state.currentImageIndex,
    switchImage: state.switchImage,
    closeImagesOverview: state.closeImagesOverview,
  }));

  const { Image } = useEditorSlots();

  // 监听 ESC 键退出预览
  useEffect(() => {
    if (!isShowImagesOverview) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        closeImagesOverview();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isShowImagesOverview, closeImagesOverview]);

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
