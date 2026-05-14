import React, { memo } from "react";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";

import styles from "./index.module.less";

interface MediaPreviewProps {
  filePath: string;
  type: "image" | "video" | "audio";
}

const MediaPreview: React.FC<MediaPreviewProps> = memo(({ filePath, type }) => {
  if (type === "image") {
    return (
      <div className={styles.container}>
        <div className={styles.imageWrapper}>
          <LocalImage url={filePath} />
        </div>
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className={styles.container}>
        <div className={styles.videoWrapper}>
          <LocalVideo src={filePath} controls className={styles.video} />
        </div>
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className={styles.container}>
        <div className={styles.audioWrapper}>
          <LocalAudio src={filePath} controls />
        </div>
      </div>
    );
  }

  return null;
});

MediaPreview.displayName = "MediaPreview";

export default MediaPreview;
