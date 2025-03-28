import React, { useRef, useMemo } from "react";
import LocalVideo from "@/components/LocalVideo";
import Editor from "@/components/Editor";
import { Descendant } from "slate";
import { createVideoNoteExtensions } from "./extensions";
import { VideoControllerImpl } from "./VideoController";
import styles from "./index.module.less";
import classnames from "classnames";

export interface VideoNoteContextType {
  captureVideoFrame: () => Promise<string | null>;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
}

interface VideoNoteProps {
  videoSrc: string;
  initialNotes?: Descendant[];
  onNotesChange?: (value: Descendant[]) => void;
  uploadResource?: (file: File) => Promise<string | null>;
  containerClassName?: string;
  videoSectionClassName?: string;
  editorSectionClassName?: string;
  videoSectionStyle?: React.CSSProperties;
  editorSectionStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
}

const VideoNote: React.FC<VideoNoteProps> = ({
  videoSrc,
  initialNotes,
  onNotesChange,
  uploadResource,
  containerClassName,
  videoSectionClassName,
  editorSectionClassName,
  videoSectionStyle,
  editorSectionStyle,
  containerStyle,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoController = useMemo(() => {
    return new VideoControllerImpl(() => videoRef.current, uploadResource);
  }, [uploadResource]);

  const extensions = useMemo(() => {
    return createVideoNoteExtensions(videoController);
  }, [videoController]);

  return (
    <div
      className={classnames(styles.container, containerClassName)}
      style={containerStyle}
    >
      <div
        className={classnames(styles.videoSection, videoSectionClassName)}
        style={videoSectionStyle}
      >
        <LocalVideo
          className={styles.video}
          ref={videoRef}
          src={videoSrc}
          controls
        />
      </div>
      <div
        className={classnames(styles.editorSection, editorSectionClassName)}
        style={editorSectionStyle}
      >
        <Editor
          initValue={initialNotes}
          onChange={onNotesChange}
          readonly={false}
          uploadResource={uploadResource}
          extensions={extensions}
        />
      </div>
    </div>
  );
};

export default VideoNote;
