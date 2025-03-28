import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";
import styles from "./index.module.less";

interface VideoTimestampProps {
  attributes: RenderElementProps["attributes"];
  element: {
    time: number;
  };
  onSeek: (time: number) => void;
}

const VideoTimestamp: React.FC<PropsWithChildren<VideoTimestampProps>> = ({
  attributes,
  element,
  children,
  onSeek,
}) => {
  const { isDark } = useTheme();

  return (
    <span
      {...attributes}
      onClick={() => onSeek(element.time)}
      className={classnames(styles.timestamp, {
        [styles.dark]: isDark,
      })}
    >
      {children}
    </span>
  );
};

export default VideoTimestamp;
