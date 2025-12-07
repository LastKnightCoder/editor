import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import classnames from "classnames";
import { useTheme } from "../../../../ThemeContext";
import { formatTimestamp } from "../../../../utils";
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
  const theme = useTheme();

  const { time } = element;

  return (
    <span
      {...attributes}
      onClick={() => onSeek(element.time)}
      className={classnames(styles.timestamp, {
        [styles.dark]: theme === "dark",
      })}
    >
      {formatTimestamp(time)}
      {children}
    </span>
  );
};

export default VideoTimestamp;
